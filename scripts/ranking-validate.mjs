import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import { Embedder, validateEmbedding, dinov2Contract } from '../src/ai/embedding.ts';
import { ANALYSIS_VERSION, LIMITS, thresholds, analysisWeights } from '../src/lib/config.ts';
import { EYES } from '../src/ai/eyes-config.ts';
import { root, catalog, verifyModels } from './models.mjs';
import { faceProbe } from './face-probe.mjs';
import { nimaPreprocessRaw, nimaDistributionStats } from './nima-preprocess.mjs';
import { CONFIGS, TIER_ORDER, rankExperimental, technicalTier } from './experimental/preference-ranking.mjs';

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--root' || !args[1] || args[1].startsWith('--')) throw new Error('Uso: npm run ranking:validate -- --root "C:\\dev\\ClickIT\\Validation Datasets"');
  return path.resolve(args[1]);
}

async function fileSha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function startRamSampler() {
  const state = { peakBytes: null, process: null };
  try {
    const script = 'while($true){ $s=(Get-Process node,electron -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum; if($s){ Write-Output $s }; Start-Sleep -Milliseconds 1500 }';
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', chunk => {
      for (const line of String(chunk).split('\n')) {
        const value = Number(line.trim());
        if (Number.isFinite(value) && value > 0) state.peakBytes = Math.max(state.peakBytes ?? 0, value);
      }
    });
    child.on('error', () => {});
    state.process = child;
  } catch { state.process = null; }
  return state;
}

export function stopRamSampler(state) {
  try { state.process?.kill(); } catch { /* já encerrado */ }
  return state.peakBytes;
}

export async function loadNimaSession() {
  const modelDir = path.join(root, 'resources', 'models');
  const manifest = JSON.parse(await readFile(path.join(modelDir, 'manifest.json'), 'utf8'));
  const model = manifest.models?.nimaAesthetic;
  if (!model) throw new Error('Manifesto NIMA ausente em resources/models/manifest.json.');
  if (path.basename(model.file) !== model.file) throw new Error('Manifesto NIMA contém caminho de modelo inválido.');
  const modelPath = path.join(modelDir, model.file);
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(modelPath)) { hash.update(chunk); bytes += chunk.length; }
  if (hash.digest('hex') !== model.sha256 || bytes !== model.bytes) throw new Error('SHA-256/tamanho do NIMA ONNX não confere com o manifesto.');
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1) throw new Error('Contrato NIMA ONNX inválido.');
  return { session, input: session.inputNames[0], output: session.outputNames[0], model };
}

export async function runNima(nima, file) {
  const started = performance.now();
  const { data, info } = await sharp(file).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width < 1 || info.height < 1 || info.channels !== 3) throw new Error(`Preprocessing RGB inesperado para ${file}`);
  const tensorData = nimaPreprocessRaw(data, info.width, info.height);
  const result = await nima.session.run({ [nima.input]: new ort.Tensor('float32', tensorData, [1, 224, 224, 3]) });
  const distribution = Array.from(result[nima.output].data, Number);
  if (distribution.length !== 10 || distribution.some(value => !Number.isFinite(value) || value < -1e-6)) throw new Error(`Distribuição NIMA inválida para ${file}`);
  const total = distribution.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-4) throw new Error(`Saída NIMA não soma 1 em ${file}: ${total}`);
  return { ...nimaDistributionStats(distribution), distribution, elapsedMs: performance.now() - started };
}

function eyesStateOf(analysis) {
  const states = analysis.faces.map(face => face.eyes);
  return states.includes('CLOSED') ? 'CLOSED' : states.includes('UNCERTAIN') ? 'UNCERTAIN' : states.includes('OPEN') ? 'OPEN' : null;
}

function ranksOf(ranked) {
  const map = new Map();
  ranked.forEach((row, index) => map.set(row.file, index + 1));
  return map;
}

function checkClosedAndSoft(rows, ranked) {
  const ranks = ranksOf(ranked);
  const good = rows.filter(row => row.labels.includes('technically-good'));
  const closed = rows.filter(row => row.labels.includes('closed-eyes'));
  const soft = rows.filter(row => row.labels.includes('soft-focus'));
  const closedApplicable = closed.length > 0 && good.length > 0;
  const softApplicable = soft.length > 0 && good.length > 0;
  const closedPass = !closedApplicable || closed.every(photo => good.every(candidate => (ranks.get(photo.file) ?? 0) > (ranks.get(candidate.file) ?? 0)));
  const softPass = !softApplicable || soft.every(photo => good.every(candidate => (ranks.get(photo.file) ?? 0) > (ranks.get(candidate.file) ?? 0)));
  const weakOrReviewTop1 = ranked[0] && ['TECHNICALLY_WEAK', 'REVIEW'].includes(ranked[0].tier) ? ranked[0].file : null;
  return { closedEyesPenaltyCorrect: closedPass, closedApplicable, softFocusPriorityCorrect: softPass, softApplicable, weakOrReviewTop1 };
}

async function validateDataset(directory, nima, embedder) {
  const started = performance.now();
  const manifestPath = path.join(directory, 'dataset.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.photos) || manifest.photos.length < 1) throw new Error(`Manifesto inválido: ${manifestPath}`);
  for (const photo of manifest.photos) {
    if (typeof photo.file !== 'string' || !Array.isArray(photo.labels)) throw new Error(`Entrada inválida em ${manifestPath}: ${JSON.stringify(photo)}`);
    if (photo.file.includes('..') || !['.png', '.jpg', '.jpeg'].includes(path.extname(photo.file).toLowerCase())) throw new Error(`Arquivo não permitido no manifesto: ${photo.file}`);
  }
  const workspace = path.join(root, '.test-tmp', 'ranking-validate', manifest.name);
  const report = {
    name: manifest.name, description: manifest.description ?? null, directory, manifestSha256: await fileSha256(manifestPath),
    mode: 'Validation only; production ranking/grouping/thresholds/models untouched; humanRank excluded from ranking',
    photos: [], orders: {}, rankings: {}, picks: {}, groups: {}, metrics: {}, errors: [], performance: null, analysisVersion: ANALYSIS_VERSION
  };
  let store = null, projectId = null;
  const prepared = new Map(), faceTimings = [], pipelineErrors = [], failedStages = new Map();
  try {
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    store = new Store(path.join(workspace, 'ranking.sqlite'));
    projectId = store.create(`Ranking validation ${manifest.name}`, directory).id;
    const pipeline = new Pipeline({
      store, model: path.join(root, 'resources/models/dinov2-small.onnx'), concurrency: 1,
      workerFile: path.join(root, 'src/workers/analysis.ts'), groupingFile: path.join(root, 'src/workers/grouping.ts'), cache: path.join(workspace, 'cache'),
      onPrepared: (id, result) => { validateEmbedding(result.embedding); prepared.set(id, result); },
      faces: async (id, preview) => {
        const faceStart = performance.now();
        try {
          const result = await faceProbe(preview, false, true);
          if (!Array.isArray(result.productionFaces)) throw new Error('Postprocessing facial de produção ausente.');
          return result.productionFaces;
        } catch (error) {
          pipelineErrors.push({ photoId: id, stage: 'face-renderer', error: error.message });
          throw error;
        } finally { faceTimings.push(performance.now() - faceStart); }
      },
      emit: progress => {
        console.log(`[${progress.done}/${progress.total}] ${progress.stage}; falhas=${progress.failed}`);
        if (progress.failed) failedStages.set(progress.stage, progress.failed);
      },
      log: (event, details) => pipelineErrors.push({ event, ...details })
    });
    await pipeline.index(projectId);
    const indexed = store.photos(projectId);
    const manifestFiles = new Set(manifest.photos.map(photo => photo.file));
    if (indexed.length !== manifestFiles.size || indexed.some(photo => !manifestFiles.has(photo.fileName))) {
      throw new Error(`Indexação (${indexed.length}: ${indexed.map(photo => photo.fileName).join(', ')}) diverge do manifesto (${[...manifestFiles].join(', ')}).`);
    }
    const pipelineStart = performance.now();
    await pipeline.analyze(projectId);
    const pipelineMs = performance.now() - pipelineStart;
    const photos = store.photos(projectId);
    for (const photo of photos.filter(item => item.analysisStatus !== 'DONE')) report.errors.push({ file: photo.fileName, stage: 'analysis', error: photo.error });

    const dinov2Timings = [];
    for (const photo of photos) {
      const result = prepared.get(photo.id);
      if (!result) continue;
      const dinov2Start = performance.now();
      await embedder.run(result.previewPath);
      dinov2Timings.push({ file: photo.fileName, totalMs: performance.now() - dinov2Start, inferenceMs: embedder.lastInferenceMs });
    }

    const nimaRows = [];
    for (const photo of manifest.photos) {
      const result = await runNima(nima, path.join(directory, photo.file));
      nimaRows.push({ file: photo.file, ...result });
      report.photos.push({ file: photo.file, labels: photo.labels, humanRank: photo.humanRank ?? null });
    }

    const nimaByFile = new Map(nimaRows.map(row => [row.file, row]));
    const analysisByFile = new Map(photos.map(photo => [photo.fileName, photo]));
    const rows = report.photos.map(entry => {
      const photo = analysisByFile.get(entry.file);
      if (!photo?.analysis) return { ...entry, technicalScore: null, blur: 'UNCERTAIN', eyesState: null, groupId: photo?.groupId ?? null, productionRank: photo?.rank ?? null, productionDecision: photo?.decision ?? null };
      const nima = nimaByFile.get(entry.file);
      return {
        ...entry, technicalScore: photo.analysis.overall, blur: photo.analysis.blur, eyesState: eyesStateOf(photo.analysis),
        faceSharpness: photo.analysis.faceScore, regionalSharpness: photo.analysis.regionalSharpness, exposure: photo.analysis.exposure,
        groupId: photo.groupId, productionRank: photo.rank, productionDecision: photo.decision,
        nimaMean: nima.nimaMean, nimaStd: nima.nimaStd, distribution: nima.distribution
      };
    });
    report.photos = rows;
    for (const row of rows) row.hasOpenAlternative = rows.some(other => other !== row && other.eyesState === 'OPEN');
    for (const row of rows) row.tier = technicalTier(row);

    report.orders.technicalScore = [...rows].filter(row => row.technicalScore !== null).sort((a, b) => b.technicalScore - a.technicalScore || a.file.localeCompare(b.file)).map(row => row.file);
    report.orders.nima = [...rows].sort((a, b) => b.nimaMean - a.nimaMean || a.file.localeCompare(b.file)).map(row => row.file);

    for (const configId of Object.keys(CONFIGS)) {
      const ranked = rankExperimental(rows, CONFIGS[configId]);
      report.rankings[configId] = ranked.map(row => ({ rank: row.experimentalRank, file: row.file, tier: row.tier, technicalScore: row.technicalScore, nimaMean: row.nimaMean, aestheticIndex: row.aestheticIndex, experimentalFinal: row.experimentalFinal }));
      report.picks[configId] = ranked[0]?.file ?? null;
      report.metrics[configId] = checkClosedAndSoft(rows, ranked);
    }

    const groups = new Map();
    for (const photo of photos) {
      const key = photo.groupId ?? `ungrouped-${photo.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(photo.fileName);
    }
    const groupList = [...groups.entries()].map(([id, files]) => ({ id, files, size: files.length })).sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
    const mainGroup = groupList[0] ?? null;
    const productionSelected = photos.find(photo => photo.decision === 'AI_SELECTED');
    report.groups = { count: groupList.length, main: mainGroup, detail: groupList };
    report.picks.production = productionSelected?.fileName ?? null;
    report.productionRanks = Object.fromEntries(photos.map(photo => [photo.fileName, photo.rank]));

    const different = rows.filter(row => row.labels.includes('different-sequence'));
    const same = rows.filter(row => !row.labels.includes('different-sequence'));
    const sequenceGrouped = same.length > 0 && same.every(row => row.groupId && row.groupId === same[0].groupId);
    const differentOutside = different.length === 0 || different.every(row => !mainGroup || row.groupId !== mainGroup.id);
    report.metrics.differentImagesOutsideSequence = {
      status: sequenceGrouped && differentOutside ? 'PASS' : 'FAIL',
      applicable: true, sequenceGrouped, differentOutside, differentCount: different.length,
      thresholdNote: 'Imagens geradas não têm data EXIF, então todo par usa visualOnlySimilarity (sem proximidade temporal).',
      detail: sequenceGrouped ? 'Todas as fotos da mesma sequência formam um único grupo.' : `Sequência dividida em ${groupList.length} grupos: ${groupList.map(group => `[${group.files.join(', ')}]`).join(' | ')}`
    };

    report.performance = {
      wallMs: performance.now() - started, images: rows.length, avgMsPerImage: (performance.now() - started) / Math.max(1, rows.length), pipelineMs,
      faceMs: faceTimings.reduce((sum, value) => sum + value, 0), faceCalls: faceTimings.length,
      dinov2Ms: dinov2Timings.reduce((sum, entry) => sum + entry.totalMs, 0), dinov2InferenceMs: dinov2Timings.reduce((sum, entry) => sum + (entry.inferenceMs ?? 0), 0), dinov2Calls: dinov2Timings.length,
      nimaMs: nimaRows.reduce((sum, row) => sum + row.elapsedMs, 0), nimaCalls: nimaRows.length,
      notes: 'dinov2Ms é medição isolada pós-análise sobre os previews em cache (pré-processo + inferência); faceMs é a duração total do faceProbe por foto (inclui esbuild/spawn Electron); nimaMs é inferência ONNX por foto.'
    };
    return report;
  } catch (error) {
    report.errors.push({ stage: 'dataset', error: error.stack ?? String(error) });
    return report;
  } finally {
    report.errors.push(...pipelineErrors);
    for (const [stage, failed] of failedStages) report.errors.push({ stage, failedCount: failed });
    try { store?.close(); } catch { /* já fechado */ }
  }
}

export function spearmanRho(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const sum = pairs.reduce((total, pair) => total + (pair.human - pair.algorithm) ** 2, 0);
  return 1 - (6 * sum) / (n * (n * n - 1));
}

export function compareHuman(report, template) {
  const templateDataset = template?.datasets?.find(item => item.dataset === report.name);
  if (templateDataset) {
    const ranks = new Map((templateDataset.photos ?? []).filter(entry => entry?.humanRank !== null && entry?.humanRank !== undefined).map(entry => [entry.file, entry.humanRank]));
    for (const row of report.photos) if (ranks.has(row.file)) row.humanRank = ranks.get(row.file);
  }
  const human = report.photos.filter(row => row.humanRank !== null && row.humanRank !== undefined);
  const uniqueRanks = new Set(human.map(row => row.humanRank));
  if (uniqueRanks.size !== human.length || human.some(row => !Number.isInteger(row.humanRank) || row.humanRank < 1 || row.humanRank > report.photos.length)) throw new Error(`Anotação humana inválida em ${report.name}: use ranks inteiros únicos entre 1 e ${report.photos.length}.`);
  const humanTop1 = human.find(row => row.humanRank === 1) ?? null;
  const humanTop3 = human.filter(row => row.humanRank <= 3);
  const byConfig = {};
  for (const configId of Object.keys(CONFIGS)) {
    const ranked = report.rankings[configId] ?? [];
    const rankByFile = new Map(ranked.map(item => [item.file, item.rank]));
    const pairs = human.filter(row => rankByFile.has(row.file)).map(row => ({ human: row.humanRank, algorithm: rankByFile.get(row.file) }));
    byConfig[configId] = {
      humanTop1Match: humanTop1 ? ranked[0]?.file === humanTop1.file : null,
      humanTop3Containment: humanTop3.length ? humanTop3.every(row => ranked.slice(0, 3).some(item => item.file === row.file)) : null,
      spearman: pairs.length === ranked.length ? spearmanRho(pairs) : null,
      spearmanSamples: pairs.length
    };
  }
  report.metrics.humanRankComparison = { humanAnnotated: human.length, humanTop1File: humanTop1?.file ?? null, source: templateDataset ? 'human-ranking-template.json' : 'dataset.json humanRank', byConfig };
}

function configSummary(datasets, configId) {
  const top1 = datasets.map(report => report.metrics.humanRankComparison?.byConfig[configId]?.humanTop1Match).filter(value => value !== null && value !== undefined);
  const top3 = datasets.map(report => report.metrics.humanRankComparison?.byConfig[configId]?.humanTop3Containment).filter(value => value !== null && value !== undefined);
  const technicalFailures = [];
  for (const report of datasets) {
    const checks = report.metrics[configId];
    if (checks) {
      if (checks.closedApplicable && !checks.closedEyesPenaltyCorrect) technicalFailures.push({ dataset: report.name, check: 'closedEyesPenaltyCorrect' });
      if (checks.softApplicable && !checks.softFocusPriorityCorrect) technicalFailures.push({ dataset: report.name, check: 'softFocusPriorityCorrect' });
      if (checks.weakOrReviewTop1) technicalFailures.push({ dataset: report.name, check: 'weakOrReviewTop1', file: checks.weakOrReviewTop1 });
    }
  }
  const spearmanValues = datasets.map(report => report.metrics.humanRankComparison?.byConfig[configId]?.spearman).filter(value => typeof value === 'number');
  return {
    top1Matches: top1.filter(Boolean).length, top1Evaluated: top1.length, top3Containment: top3.filter(Boolean).length, top3Evaluated: top3.length,
    spearmanMean: spearmanValues.length ? spearmanValues.reduce((sum, value) => sum + value, 0) / spearmanValues.length : null, spearmanEvaluated: spearmanValues.length,
    technicalFailures
  };
}

export function compareHumanGroups(report, annotations) {
  if (!Array.isArray(annotations)) throw new Error('Template humano por grupo deve ser um array.');
  const comparisons = [];
  for (const annotation of annotations.filter(item => !item.dataset || item.dataset === report.name)) {
    if (!Array.isArray(annotation.humanRank)) throw new Error('humanRank por grupo deve ser um array de nomes de arquivos.');
    if (!annotation.humanRank.length) continue;
    const humanOrder = annotation.humanRank;
    if (new Set(humanOrder).size !== humanOrder.length || humanOrder.some(file => typeof file !== 'string')) throw new Error('humanRank deve conter nomes únicos.');
    const key = files => JSON.stringify([...files].sort());
    const group = report.groups.detail.find(item => key(item.files) === key(humanOrder));
    if (!group && !annotation.dataset) continue;
    if (!group) throw new Error(`Anotação ${annotation.groupId} não corresponde ao conjunto de arquivos de um grupo atual em ${report.name}.`);
    const configs = {};
    for (const id of Object.keys(CONFIGS)) {
      const order = report.rankings[id].filter(row => group.files.includes(row.file)).map(row => row.file);
      configs[id] = {
        humanTop1Match: order[0] === humanOrder[0],
        humanTop3Containment: humanOrder.slice(0, 3).every(file => order.slice(0, 3).includes(file)),
        spearman: spearmanRho(humanOrder.map((file, i) => ({ human: i + 1, algorithm: order.indexOf(file) + 1 })))
      };
    }
    comparisons.push({ annotatedGroupId: annotation.groupId, currentGroupId: group.id, files: group.files, byConfig: configs });
  }
  report.metrics.groupHumanRankComparison = { annotatedGroups: comparisons.length, matching: 'dataset + file set (group UUIDs are unstable)', comparisons };
}

async function main() {
  let rootDirectory;
  try { rootDirectory = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const started = performance.now(), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const entries = await readdir(rootDirectory, { withFileTypes: true }).catch(() => []);
  const datasetDirs = entries.filter(entry => entry.isDirectory()).map(entry => path.join(rootDirectory, entry.name)).filter(directory => existsSync(path.join(directory, 'dataset.json'))).sort();
  if (!datasetDirs.length) { console.error(`Nenhum dataset com dataset.json encontrado em ${rootDirectory}`); process.exitCode = 2; return; }
  if (datasetDirs.length !== 3) console.log(`Atenção: esperados 3 datasets, encontrados ${datasetDirs.length} em ${rootDirectory}.`);

  const summary = {
    generatedAt: new Date().toISOString(), root: rootDirectory, mode: 'Validation only; no production code/weights/thresholds/models changed; humanRank excluded from ranking and compared only after ClickIT rankings exist',
    inputs: { analysisVersion: ANALYSIS_VERSION, weights: analysisWeights, thresholds, limits: { similarity: LIMITS.similarity, visualOnlySimilarity: LIMITS.visualOnlySimilarity }, eyes: EYES, dinov2: dinov2Contract, tierOrder: TIER_ORDER, models: catalog },
    configs: Object.fromEntries(Object.entries(CONFIGS).map(([id, config]) => [id, { name: config.name, description: config.description, weights: config.weights, tierFactor: config.tierFactor }])),
    datasets: [], summary: null
  };

  const sampler = startRamSampler();
  const embedder = new Embedder();
  let nima = null;
  try {
    await verifyModels();
    await embedder.load(path.join(root, 'resources/models/dinov2-small.onnx'));
    nima = await loadNimaSession();
    for (const directory of datasetDirs) {
      console.log(`\n=== Dataset: ${path.basename(directory)} ===`);
      const report = await validateDataset(directory, nima, embedder);
      summary.datasets.push(report);
      console.table(report.photos.map(row => ({ file: row.file, labels: row.labels.join('+'), tier: row.tier ?? null, tech: row.technicalScore, nima: row.nimaMean?.toFixed(6), A: report.rankings.A?.find(item => item.file === row.file)?.rank, B: report.rankings.B?.find(item => item.file === row.file)?.rank, C: report.rankings.C?.find(item => item.file === row.file)?.rank })));
      console.log(`Ordem technicalScore: ${report.orders.technicalScore?.join(' > ') ?? 'n/d'}`);
      console.log(`Ordem NIMA: ${report.orders.nima?.join(' > ') ?? 'n/d'}`);
      console.log(`Grupos: ${report.groups.count ?? 0} | Picks — produção: ${report.picks.production ?? 'nenhum'} | A: ${report.picks.A ?? 'n/d'} | B: ${report.picks.B ?? 'n/d'} | C: ${report.picks.C ?? 'n/d'}`);
      console.log(`Métricas — closed: A=${report.metrics.A?.closedEyesPenaltyCorrect} B=${report.metrics.B?.closedEyesPenaltyCorrect} C=${report.metrics.C?.closedEyesPenaltyCorrect} | soft: A=${report.metrics.A?.softFocusPriorityCorrect} B=${report.metrics.B?.softFocusPriorityCorrect} C=${report.metrics.C?.softFocusPriorityCorrect} | sequência: ${report.metrics.differentImagesOutsideSequence?.status}`);
      console.log(`Erros: ${report.errors.length} | tempo total: ${(report.performance?.wallMs ?? 0).toFixed(0)} ms`);
    }

    const templatePath = path.join(rootDirectory, 'human-ranking-template.json');
    let humanTemplate = null;
    if (existsSync(templatePath)) {
      humanTemplate = JSON.parse((await readFile(templatePath, 'utf8')).replace(/^\uFEFF/, ''));
      console.log(`Template humano encontrado (${path.relative(rootDirectory, templatePath)}); comparação executada somente após os rankings ClickIT e sem efeito em pesos/thresholds.`);
    }
    for (const report of summary.datasets) compareHuman(report, humanTemplate);
    const groupTemplatePath = path.join(root, 'human-ranking-template.json');
    if (existsSync(groupTemplatePath)) {
      const groupTemplate = JSON.parse((await readFile(groupTemplatePath, 'utf8')).replace(/^\uFEFF/, ''));
      for (const report of summary.datasets) compareHumanGroups(report, groupTemplate);
    }

    const table = summary.datasets.map(report => ({
      dataset: report.name, A_Pick: report.picks.A, B_Pick: report.picks.B, C_Pick: report.picks.C,
      Human_Pick: report.metrics.humanRankComparison?.humanTop1File ?? null,
      A_Top3: (report.rankings.A ?? []).slice(0, 3).map(row => row.file).join(' > '),
      B_Top3: (report.rankings.B ?? []).slice(0, 3).map(row => row.file).join(' > '),
      C_Top3: (report.rankings.C ?? []).slice(0, 3).map(row => row.file).join(' > ')
    }));
    const configs = Object.fromEntries(Object.keys(CONFIGS).map(id => [id, configSummary(summary.datasets, id)]));
    const weakOrReviewTop1 = summary.datasets.flatMap(report => Object.keys(CONFIGS).filter(id => report.metrics[id]?.weakOrReviewTop1).map(id => ({ dataset: report.name, config: id, file: report.metrics[id].weakOrReviewTop1 })));
    const softBeatsGood = summary.datasets.flatMap(report => Object.keys(CONFIGS).filter(id => { const checks = report.metrics[id]; return checks?.softApplicable && !checks.softFocusPriorityCorrect; }).map(id => ({ dataset: report.name, config: id })));
    const closedFails = summary.datasets.flatMap(report => Object.keys(CONFIGS).filter(id => { const checks = report.metrics[id]; return checks?.closedApplicable && !checks.closedEyesPenaltyCorrect; }).map(id => ({ dataset: report.name, config: id })));
    const groupingFails = summary.datasets.filter(report => report.metrics.differentImagesOutsideSequence?.status === 'FAIL').map(report => report.name);
    const picksDifferAcrossConfigs = summary.datasets.filter(report => new Set([report.picks.A, report.picks.B, report.picks.C]).size > 1).map(report => report.name);
    const anyErrors = summary.datasets.filter(report => report.errors.length).map(report => ({ dataset: report.name, errors: report.errors }));

    const behaviorOk = !weakOrReviewTop1.length && !softBeatsGood.length && !closedFails.length;
    const groupingOk = !groupingFails.length;
    const noTechnicalErrors = !anyErrors.length;
    const consistentConfigs = Object.keys(CONFIGS).filter(id => configs[id].technicalFailures.length === 0);
    const classification = !behaviorOk || !consistentConfigs.length ? 'NOT_READY'
      : groupingOk && noTechnicalErrors ? 'READY_FOR_BETA_EXPERIMENT' : 'READY_FOR_MORE_DATA';

    summary.summary = {
      table, configs,
      consistency: {
        closedPenaltyAllDatasetsAllConfigs: !closedFails.length, closedFails,
        softPriorityAllDatasetsAllConfigs: !softBeatsGood.length, softBeatsGood,
        weakOrReviewNeverTop1: !weakOrReviewTop1.length, weakOrReviewTop1,
        groupingAllDatasets: groupingOk, groupingFails,
        picksDifferAcrossConfigs, anyErrors,
        consistentConfigs,
        classification,
        rubric: 'NOT_READY: falha de comportamento (WEAK/REVIEW como top1, soft-focus acima de technically-good, ou closed-eyes não penalizado). READY_FOR_BETA_EXPERIMENT: comportamento correto + agrupamento PASS nos 3 datasets + sem erros técnicos. READY_FOR_MORE_DATA: comportamento correto com agrupamento/erros pendentes (≥1 configuração consistente).'
      },
      humanRank: summary.datasets.map(report => ({ dataset: report.name, annotated: report.metrics.humanRankComparison?.humanAnnotated ?? 0, source: report.metrics.humanRankComparison?.source ?? null, spearman: Object.fromEntries(Object.entries(report.metrics.humanRankComparison?.byConfig ?? {}).map(([id, value]) => [id, value.spearman])) })),
      humanRankNote: 'Templates humanos são lidos após os rankings. O template na raiz compara grupos por conjunto de arquivos; o template em Validation Datasets compara o dataset inteiro. Nenhuma resposta humana altera pesos, thresholds ou treinamento. Top1 = mesmo primeiro arquivo; Top3 = top3 humano contido no top3 ClickIT; Spearman exige ordenação completa sem empates e n>=2, senão null.',
      performance: {
        totalMs: performance.now() - started,
        perDataset: summary.datasets.map(report => ({ dataset: report.name, ...report.performance })),
        ramPeakBytesApprox: stopRamSampler(sampler),
        ramNote: 'Soma de WorkingSet64 de processos node+electron no host, amostrada a cada 1,5s (aproximada; pode incluir processos não relacionados). maxRSS do processo node principal em processMaxRssKb.'
      },
      processMaxRssKb: process.resourceUsage().maxRSS
    };

    await mkdir(path.join(root, 'docs/evidence'), { recursive: true });
    const summaryPath = path.join(root, 'docs/evidence/ranking-validation-summary.json');
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    for (const report of summary.datasets) {
      const datasetPath = path.join(root, 'docs/evidence', `ranking-validation-${report.name}-${stamp}.json`);
      await writeFile(datasetPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    console.log('\n=== Tabela agregada ===');
    console.table(table);
    for (const [id, config] of Object.entries(configs)) console.log(`Config ${id}: top1=${config.top1Matches}/${config.top1Evaluated} top3=${config.top3Containment}/${config.top3Evaluated} falhasTécnicas=${config.technicalFailures.length}${config.technicalFailures.length ? ` → ${JSON.stringify(config.technicalFailures)}` : ''}`);
    console.log(`Consistência: ${JSON.stringify(summary.summary.consistency, null, 2)}`);
    console.log(`Classificação: ${classification}`);
    console.log(`Evidência agregada: ${path.relative(root, summaryPath)}`);
    console.log(`Tempo total: ${((performance.now() - started) / 1000).toFixed(1)} s`);
    if (classification === 'NOT_READY' || anyErrors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  } finally {
    stopRamSampler(sampler);
    try { await nima?.session.release(); } catch { /* já liberada */ }
    try { await embedder.close(); } catch { /* já fechada */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
