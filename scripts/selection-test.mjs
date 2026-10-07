import { mkdir, mkdtemp, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import { cosine, connection, connectedComponents } from '../src/ai/grouping.ts';
import { validateEmbedding, dinov2Contract } from '../src/ai/embedding.ts';
import { ANALYSIS_VERSION, LIMITS, thresholds, analysisWeights } from '../src/lib/config.ts';
import { EYES } from '../src/ai/eyes-config.ts';
import { root, catalog, verifyModels } from './models.mjs';
import { faceProbe } from './face-probe.mjs';
import { contributions, explainRanking, validateScenario } from './selection-report.mjs';

async function sha256(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
export function parseSelectionArgs(args) {
  if (args.length !== 2 || args[0] !== '--dir' || !args[1] || args[1].startsWith('--')) throw new Error('Uso: npm run selection:test -- --dir "C:\\dev\\ClickIT\\Imagens Teste"');
  return path.resolve(args[1]);
}

async function main() {
  let directory;
  try { directory = parseSelectionArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const started = performance.now(), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const evidence = path.join(root, `docs/evidence/selection-test-${stamp}.json`);
  const report = { generatedAt: new Date().toISOString(), directory, evidence, ok: false, stage: 'init', implementation: 'Production Pipeline + analysis worker + shared renderer face-analysis + grouping worker + Store', analysisVersion: ANALYSIS_VERSION, models: catalog, thresholds: { limits: LIMITS, quality: thresholds, weights: analysisWeights, eyes: EYES, dinov2: dinov2Contract }, notes: ['Ranking técnico relativo dentro do grupo. Não mede composição/expressão estética.', 'Datas EXIF ausentes não são inventadas a partir do nome da imagem.', 'Similarity no ranking é contra o representante original do grupo, não necessariamente contra o Pick.', 'Não há comparação de mérito entre imagens de grupos diferentes.'], progress: [], errors: [], images: [], similarities: [], groups: [], checks: [] };
  let store, projectId;
  const prepared = new Map(), facial = new Map();
  try {
    report.stage = 'input';
    if (!(await stat(directory)).isDirectory()) throw new Error('O caminho não é uma pasta.');
    await mkdir(path.join(root, '.test-tmp'), { recursive: true });
    const workspace = await mkdtemp(path.join(root, '.test-tmp/selection-'));
    report.workspace = workspace;
    store = new Store(path.join(workspace, 'selection.sqlite'));
    projectId = store.create('Selection diagnostic', directory).id;
    const pipeline = new Pipeline({
      store, model: path.join(root, 'resources/models/dinov2-small.onnx'), concurrency: 1,
      workerFile: path.join(root, 'src/workers/analysis.ts'), groupingFile: path.join(root, 'src/workers/grouping.ts'), cache: path.join(workspace, 'cache'),
      onPrepared: (id, result) => { validateEmbedding(result.embedding); prepared.set(id, result); },
      faces: async (id, preview) => {
        try {
          const result = await faceProbe(preview, false, true);
          if (!Array.isArray(result.productionFaces)) throw new Error('Postprocessing facial de produção ausente.');
          facial.set(id, { ok: true, ...result }); return result.productionFaces;
        } catch (error) { facial.set(id, { ok: false, error: error.stack }); report.errors.push({ photoId: id, stage: 'face-renderer', error: error.message }); throw error; }
      },
      emit: progress => { report.progress.push({ timestamp: new Date().toISOString(), ...progress }); console.log(`[${progress.done}/${progress.total}] ${progress.stage}; falhas=${progress.failed}`); },
      log: (event, details) => report.errors.push({ event, ...details })
    });
    report.stage = 'index'; await pipeline.index(projectId);
    for (const photo of store.photos(projectId)) report.images.push({ id: photo.id, fileName: photo.fileName, path: photo.originalPath, sha256: await sha256(photo.originalPath) });
    if (!report.images.length) throw new Error('Nenhuma imagem compatível encontrada.');
    report.stage = 'models'; await verifyModels();
    report.stage = 'pipeline'; await pipeline.analyze(projectId);
    report.stage = 'report';
  } catch (error) { report.errors.push({ stage: report.stage, error: error.stack }); }
  finally {
    try {
      if (store && projectId) {
        const photos = store.photos(projectId);
        for (const photo of photos) {
          let row = report.images.find(image => image.id === photo.id);
          if (!row) { row = { id: photo.id, fileName: photo.fileName, path: photo.originalPath, sha256: await sha256(photo.originalPath) }; report.images.push(row); }
          const native = prepared.get(photo.id);
          Object.assign(row, { analysisStatus: photo.analysisStatus, error: photo.error, date: photo.captureDate ?? native?.captureDate ?? null, embeddingDimension: native?.embedding?.length ?? null, embedding: native?.embedding ?? null, nativeMetrics: native ? { focusGlobal: native.global, focusRegional: native.regional, exposure: native.light, hash: native.hash } : null, analysis: photo.analysis, weightedContributions: contributions(photo.analysis), facial: facial.get(photo.id) ?? null, groupId: photo.groupId, rank: photo.rank, similarity: photo.similarity, decision: photo.decision, finalScore: photo.analysis?.overall ?? null, originalsUnchanged: row.sha256 === await sha256(photo.originalPath) });
        }
        const embedded = report.images.filter(row => row.embedding);
        for (let i = 0; i < embedded.length; i++) for (let j = i + 1; j < embedded.length; j++) {
          const a = embedded[i], b = embedded[j];
          const deltaSeconds = a.date && b.date ? Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 1000 : null;
          const threshold = connection({ ...a, hash: a.sha256 }, { ...b, hash: b.sha256 }).threshold;
          const similarity = cosine(a.embedding, b.embedding);
          report.similarities.push({ a: a.id, b: b.id, aFile: a.fileName, bFile: b.fileName, similarity, deltaSeconds, threshold, passesThreshold: similarity >= threshold, exactDuplicate: a.sha256 === b.sha256 });
        }
        const vertices = embedded.map(row => ({ ...row, hash: row.sha256 }));
        report.graph = {
          algorithm: 'All-pairs visual edges + connected components (union-find); ranking unchanged',
          labels: embedded.map((row, index) => ({ label: index < 26 ? String.fromCharCode(65 + index) : String(index + 1), id: row.id, fileName: row.fileName })),
          matrix: embedded.map(a => embedded.map(b => a.id === b.id ? 1 : cosine(a.embedding, b.embedding))),
          edges: report.similarities.filter(pair => pair.passesThreshold || pair.exactDuplicate),
          components: connectedComponents(vertices).map(component => component.map(row => ({ id: row.id, fileName: row.fileName }))),
          note: 'Visual components computed from actual embeddings even if facial analysis fails; persisted ranked groups require the complete pipeline.'
        };
        for (const groupId of new Set(photos.map(photo => photo.groupId).filter(Boolean))) {
          const members = photos.filter(photo => photo.groupId === groupId).sort((a, b) => a.rank - b.rank);
          const representative = [...members].sort((a, b) => (a.captureDate ?? '').localeCompare(b.captureDate ?? '') || a.id.localeCompare(b.id))[0];
          const selected = members.find(photo => photo.decision === 'AI_SELECTED');
          const output = { id: groupId, ids: members.map(photo => photo.id), files: members.map(photo => photo.fileName), representativeId: representative.id, duplicate: members[0].duplicate, topRanked: { id: members[0].id, fileName: members[0].fileName }, clickitPick: selected ? { id: selected.id, fileName: selected.fileName } : null, ranking: members.map((photo, index) => ({ id: photo.id, fileName: photo.fileName, rank: photo.rank, similarityToRepresentative: photo.similarity, finalScore: photo.analysis.overall, partialScores: photo.analysis, contributions: contributions(photo.analysis), decision: photo.decision, mainReason: explainRanking(photo, index === 0 ? members[1] : members[0]) })) };
          report.groups.push(output);
        }
        report.groups.sort((a, b) => b.ids.length - a.ids.length || a.id.localeCompare(b.id));
        const fixture = JSON.parse(await readFile(path.join(root, 'scripts/selection-expectations.json'), 'utf8'));
        const matchesFixture = fixture.images.length === report.images.length && fixture.images.every(expected => report.images.some(image => image.sha256 === expected.sha256));
        report.expectations = matchesFixture ? fixture : null;
        for (const label of report.graph.labels) label.role = report.expectations?.images.find(expected => expected.sha256 === report.images.find(image => image.id === label.id)?.sha256)?.role ?? 'unlabelled';
        report.checks = validateScenario(report.images, report.groups, report.expectations);
        report.pipelineComplete = report.images.length > 0 && report.images.every(row => row.analysisStatus === 'DONE' && row.analysis?.facesAvailable && row.embeddingDimension === dinov2Contract.output.embeddingDimensions && row.originalsUnchanged);
        report.ok = report.pipelineComplete && !report.errors.length && report.checks.every(check => check.status === 'PASS');
      }
    } catch (error) { report.errors.push({ stage: 'report', error: error.stack }); report.ok = false; }
    finally { store?.close(); }
    report.elapsedMs = performance.now() - started;
    const primary = report.groups.find(group => group.ids.length > 1) ?? null;
    report.summary = { imagesRead: report.images.filter(row => row.nativeMetrics).length, imagesIndexed: report.images.length, analyzedCompletely: report.images.filter(row => row.analysisStatus === 'DONE').length, groupsIncludingSingletons: report.groups.length, sequences: report.groups.filter(group => group.ids.length > 1).length, mainGroup: primary?.files ?? [], mainPick: primary?.clickitPick ?? null, outsideMainGroup: primary ? report.images.filter(row => row.groupId && row.groupId !== primary.id).map(row => row.fileName) : [], isolated: report.groups.filter(group => group.ids.length === 1).flatMap(group => group.files), failedImages: report.images.filter(row => row.analysisStatus !== 'DONE').map(row => ({ fileName: row.fileName, error: row.error })) };
    await mkdir(path.dirname(evidence), { recursive: true });
    await writeFile(evidence + '.partial', JSON.stringify(report, null, 2), { flag: 'wx' }); await rename(evidence + '.partial', evidence);
    if (report.graph) {
      console.log('\nMatriz de similaridade (valores completos no JSON):');
      for (const label of report.graph.labels) console.log(`${label.label}: ${label.fileName} [${label.role}]`);
      console.table(report.graph.matrix.map((row, i) => Object.fromEntries([['image', report.graph.labels[i].label], ...row.map((value, j) => [report.graph.labels[j].label, value.toFixed(6)])])));
      for (const pair of report.similarities) console.log(`${pair.aFile} <> ${pair.bFile}: ${pair.similarity} / threshold=${pair.threshold} / ${pair.passesThreshold || pair.exactDuplicate ? 'EDGE' : 'NO EDGE'}`);
      console.log('Componentes visuais:', JSON.stringify(report.graph.components));
    }
    for (const [index, group] of report.groups.entries()) {
      console.log(`\nGrupo ${index + 1}${group.ids.length === 1 ? ' (isolada)' : ''}`);
      for (const row of group.ranking) console.log(`${row.fileName} | similarity=${row.similarityToRepresentative.toFixed(6)} | foco=${(row.partialScores.faceScore ?? row.partialScores.regionalSharpness).toFixed(2)} | olhos=${row.partialScores.faces.map(face => face.eyes).join(',') || 'sem rosto'} | score=${row.finalScore} | rank=${row.rank}\n  ${row.mainReason}`);
      console.log(`ClickIT Pick: ${group.clickitPick?.fileName ?? 'nenhuma sugestão automática; revisar o primeiro do ranking'}`);
    }
    console.log('\nResumo: ' + JSON.stringify(report.summary, null, 2));
    console.log('Validação: ' + JSON.stringify(report.checks, null, 2));
    console.log(`${report.ok ? 'PASS' : 'FAIL'} — Evidência: ${evidence}`);
    if (!report.ok) process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
