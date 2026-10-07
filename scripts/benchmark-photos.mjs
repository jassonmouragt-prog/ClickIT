import { mkdir, readFile, writeFile, rm, readdir, link, copyFile, unlink, stat } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import { Embedder, validateEmbedding } from '../src/ai/embedding.ts';
import { ANALYSIS_VERSION, LIMITS } from '../src/lib/config.ts';
import { exists } from '../src/lib/files.ts';
import { root, verifyModels } from './models.mjs';
import { faceProbe } from './face-probe.mjs';
import { loadNimaSession, runNima, startRamSampler, stopRamSampler } from './ranking-validate.mjs';

const MODEL_PATH = path.join(root, 'resources/models/dinov2-small.onnx');
const ISOLATED_SAMPLE = 50;
const CONCURRENCY = 2;

function parseArgs(args) {
  const options = { dir: null, sizes: [100, 500, 1000], mode: 'volume' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') {
      const dir = args[++i];
      if (!dir || dir.startsWith('--')) throw new Error('--dir exige um caminho.');
      options.dir = path.resolve(dir);
    }
    else if (arg === '--sizes') {
      const raw = args[++i];
      if (!raw) throw new Error('--sizes exige lista separada por vírgulas.');
      options.sizes = [...new Set(raw.split(',').map(value => Number(value.trim())))].sort((a, b) => a - b);
    } else if (arg === '--cache-test') options.mode = 'cache';
    else if (arg === '--resume-test') options.mode = 'resume';
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!options.dir) throw new Error('Uso: npm run benchmark:photos -- --dir "C:\\fotos" [--sizes 100,500,1000] [--cache-test | --resume-test]');
  if (options.sizes.some(size => !Number.isInteger(size) || size < 1)) throw new Error('--sizes aceita apenas inteiros positivos.');
  return options;
}

async function fileSha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function collectPool(poolDir) {
  const files = [];
  const walkDir = async current => {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (['node_modules', '.git', '.test-tmp', 'dist'].includes(entry.name)) continue;
        await walkDir(path.join(current, entry.name));
      } else if (entry.isFile() && !entry.name.startsWith('.') && ['.jpg', '.jpeg', '.png'].includes(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(current, entry.name));
      }
    }
  };
  await walkDir(poolDir);
  return files.sort((a, b) => a.localeCompare(b));
}

async function ensureDataset(pool, poolDir, size) {
  const datasetDir = path.join(root, '.test-tmp', 'benchmark', `photos-${size}`);
  const manifestPath = path.join(datasetDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.poolDir === poolDir && manifest.size === size && manifest.entries.length === size && manifest.entries.every(entry => existsSync(path.join(datasetDir, entry.file)))) {
        return { datasetDir, manifest, reused: true };
      }
    } catch { /* manifesto inválido: recria */ }
  }
  await rm(datasetDir, { recursive: true, force: true });
  await mkdir(datasetDir, { recursive: true });
  const entries = [], methodCounts = { hardlink: 0, copy: 0 };
  for (let i = 0; i < size; i++) {
    const source = pool[i % pool.length];
    const file = `${String(i).padStart(4, '0')}-${path.basename(source)}`;
    let method = 'hardlink';
    try { await link(source, path.join(datasetDir, file)); } catch { await copyFile(source, path.join(datasetDir, file)); method = 'copy'; }
    methodCounts[method]++;
    entries.push({ file, source, method });
  }
  const manifest = {
    generatedAt: new Date().toISOString(), poolDir, poolFiles: pool.length, size, methodCounts,
    replication: `Entrada i = pool[i % ${pool.length}] - réplicas documentadas de ${pool.length} fontes distintas; hardlink com fallback para cópia; nenhuma fonte é modificada.`,
    entries
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { datasetDir, manifest, reused: false };
}

async function dirSize(directory) {
  let total = 0;
  const walkDir = async current => {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walkDir(full);
      else if (entry.isFile()) { try { total += (await stat(full)).size; } catch { /* removido durante a leitura */ } }
    }
  };
  await walkDir(directory);
  return total;
}

async function pendingCount(store, projectId) {
  const photos = store.photos(projectId);
  let count = 0;
  for (const photo of photos) {
    if (photo.analysisStatus !== 'DONE' || photo.analysis?.version !== ANALYSIS_VERSION || !photo.analysis?.embeddingAvailable || !photo.analysis?.facesAvailable || !photo.previewPath || !await exists(photo.previewPath) || !photo.thumbnailPath || !await exists(photo.thumbnailPath)) count++;
  }
  return count;
}

async function runPipeline(options) {
  const { workspace, datasetDir, label, fresh = false, cancelAtRatio = null, projectId: reuseProjectId = null } = options;
  if (fresh) await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  const store = new Store(path.join(workspace, 'benchmark.sqlite'));
  const errors = [], preparedIds = [], faceTimings = [];
  let pipeline = null, groupStart = null, cancelRequested = false;
  try {
    const project = reuseProjectId ? store.project(reuseProjectId) : store.create(`Benchmark ${label}`, datasetDir);
    let lastLogged = -1;
    pipeline = new Pipeline({
      store, model: MODEL_PATH, concurrency: CONCURRENCY,
      workerFile: path.join(root, 'src/workers/analysis.ts'), groupingFile: path.join(root, 'src/workers/grouping.ts'), cache: path.join(workspace, 'cache'),
      onPrepared: (id, result) => { validateEmbedding(result.embedding); preparedIds.push(id); },
      faces: async (id, preview) => {
        const started = performance.now();
        try {
          const result = await faceProbe(preview, false, true);
          if (!Array.isArray(result.productionFaces)) throw new Error('Postprocessing facial de produção ausente.');
          return result.productionFaces;
        } catch (error) {
          errors.push({ photoId: id, stage: 'face-renderer', error: error.message });
          throw error;
        } finally { faceTimings.push(performance.now() - started); }
      },
      emit: progress => {
        if (progress.stage === 'Comparando imagens · criando seleção' && progress.active) groupStart = performance.now();
        const every = progress.kind === 'INDEX' ? 200 : 100;
        if (!progress.active || (progress.done > 0 && progress.done % every === 0 && progress.done !== lastLogged)) {
          lastLogged = progress.done;
          console.log(`[${label}] ${progress.stage} ${progress.done}/${progress.total} falhas=${progress.failed}`);
        }
        if (cancelAtRatio && !cancelRequested && progress.kind === 'ANALYSIS' && progress.active && progress.total > 0 && progress.done >= Math.ceil(progress.total * cancelAtRatio)) {
          cancelRequested = true;
          console.log(`[${label}] cancelamento solicitado em ${progress.done}/${progress.total}.`);
          pipeline?.cancel();
        }
      },
      log: (event, details) => errors.push({ event, ...details })
    });
    const indexStart = performance.now();
    await pipeline.index(project.id);
    const indexMs = performance.now() - indexStart;
    const pendingBefore = await pendingCount(store, project.id);
    const analyzeStart = performance.now();
    await pipeline.analyze(project.id);
    const analyzeMs = performance.now() - analyzeStart;
    const photos = store.photos(project.id);
    const groupMs = groupStart ? performance.now() - groupStart : 0;
    const faceMsTotal = faceTimings.reduce((sum, value) => sum + value, 0);
    const doneRows = photos.filter(photo => photo.analysisStatus === 'DONE');
    const failedRows = photos.filter(photo => photo.analysisStatus === 'FAILED');
    return {
      label, workspace, datasetDir, projectId: project.id,
      indexMs, analyzeMs, total: photos.length, pendingBefore,
      preparedCount: preparedIds.length, hits: photos.length - preparedIds.length, misses: preparedIds.length,
      done: doneRows.length, failed: failedRows.length, pending: photos.length - doneRows.length - failedRows.length,
      doneIds: doneRows.map(photo => photo.id),
      failures: failedRows.map(photo => ({ file: photo.fileName, error: photo.error })),
      faceMsTotal, faceCalls: faceTimings.length, faceAvgMs: faceTimings.length ? faceMsTotal / faceTimings.length : 0,
      groupMs, workerResidualMs: Math.max(0, analyzeMs - faceMsTotal - groupMs),
      cancelled: pipeline.cancelled, status: store.project(project.id).status,
      groupedCount: photos.filter(photo => photo.groupId).length,
      photosPerMinute: analyzeMs > 0 ? photos.length / (analyzeMs / 60000) : 0,
      filesPerMinute: indexMs > 0 ? photos.length / (indexMs / 60000) : 0,
      avgMsPerPhoto: photos.length ? analyzeMs / photos.length : 0,
      cacheBytes: await dirSize(path.join(workspace, 'cache')),
      sampleable: doneRows.map(photo => ({ fileName: photo.fileName, previewPath: photo.previewPath, originalPath: photo.originalPath })),
      preparedIds, errors: [...errors]
    };
  } catch (error) {
    return {
      label, workspace, datasetDir, projectId: reuseProjectId, indexMs: 0, analyzeMs: 0, total: 0, pendingBefore: 0,
      preparedCount: 0, hits: 0, misses: 0, done: 0, failed: 0, doneIds: [], failures: [],
      faceMsTotal: 0, faceCalls: 0, faceAvgMs: 0, groupMs: 0, workerResidualMs: 0,
      cancelled: pipeline?.cancelled ?? false, status: 'ERROR', groupedCount: 0,
      photosPerMinute: 0, filesPerMinute: 0, avgMsPerPhoto: 0, cacheBytes: 0,
      sampleable: [], preparedIds: [], errors: [...errors, { stage: 'pipeline', error: error.stack ?? String(error) }]
    };
  } finally {
    try { store.close(); } catch { /* já fechado */ }
  }
}

async function isolatedMetrics(photos, embedder, nima) {
  const sample = photos.filter(photo => photo.previewPath && existsSync(photo.previewPath)).slice(0, ISOLATED_SAMPLE);
  if (sample.length) {
    try {
      await embedder.run(sample[0].previewPath);
      await runNima(nima, sample[0].originalPath);
      await sharp(sample[0].originalPath, { limitInputPixels: 150_000_000 }).rotate().resize(LIMITS.preview, LIMITS.preview, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    } catch { /* erros reaparecem na amostragem cronometrada */ }
  }
  let dinov2Ms = 0, inferenceMs = 0, nimaMs = 0, previewMs = 0;
  const isolatedErrors = [];
  for (const photo of sample) {
    try {
      const dinoStart = performance.now();
      await embedder.run(photo.previewPath);
      dinov2Ms += performance.now() - dinoStart;
      inferenceMs += embedder.lastInferenceMs ?? 0;
      nimaMs += (await runNima(nima, photo.originalPath)).elapsedMs;
      const previewStart = performance.now();
      await sharp(photo.originalPath, { limitInputPixels: 150_000_000 }).rotate().resize(LIMITS.preview, LIMITS.preview, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      previewMs += performance.now() - previewStart;
    } catch (error) { isolatedErrors.push({ file: photo.fileName, error: error.message }); }
  }
  const count = Math.max(1, sample.length);
  return {
    sampleSize: sample.length,
    dinov2AvgMs: dinov2Ms / count, dinov2InferenceAvgMs: inferenceMs / count,
    nimaAvgMs: nimaMs / count, previewAvgMs: previewMs / count, isolatedErrors,
    note: 'Médias sobre amostra de até 50 fotos DONE, medidas isoladamente pós-análise (fora do pipeline), com uma chamada de aquecimento não cronometrada: DINOv2 sobre o preview em cache (pré-processo + inferência), NIMA sobre o original, preview = receita sharp do worker (resize LIMITS.preview + jpeg 88).'
  };
}

async function volumeMode(options, pool, poolManifest) {
  const embedder = new Embedder();
  let nima = null;
  const tiers = [];
  try {
    await verifyModels();
    await embedder.load(MODEL_PATH);
    nima = await loadNimaSession();
    for (const size of options.sizes) {
      console.log(`\n=== Tier ${size} ===`);
      const dataset = await ensureDataset(pool, options.dir, size);
      const sampler = startRamSampler();
      let run = null, isolated = null, ramPeak = null;
      try {
        run = await runPipeline({ workspace: path.join(root, '.test-tmp/benchmark', `ws-${size}`), datasetDir: dataset.datasetDir, label: `tier-${size}`, fresh: true });
        if (!run.errors.length) isolated = await isolatedMetrics(run.sampleable, embedder, nima);
        else console.log(`Tier ${size} com erros de pipeline; métricas isoladas puladas.`);
      } finally { ramPeak = stopRamSampler(sampler); }
      const tier = {
        size, datasetDir: dataset.datasetDir, datasetReused: dataset.reused,
        replication: { poolFiles: dataset.manifest.poolFiles, methodCounts: dataset.manifest.methodCounts, note: dataset.manifest.replication },
        run, isolated, ramPeakBytesApprox: ramPeak
      };
      tiers.push(tier);
      if (!run.errors.length) {
        console.log(`Tier ${size}: done=${run.done}/${run.total} falhas=${run.failed} | ${run.photosPerMinute.toFixed(1)} fotos/min | face médio ${run.faceAvgMs.toFixed(0)} ms | RAM pico aprox. ${(ramPeak / 1048576).toFixed(0)} MiB`);
      } else {
        console.log(`Tier ${size}: ERRO - ${run.errors[run.errors.length - 1].error ?? 'detalhe em evidência'}`);
      }
    }
  } finally {
    try { await nima?.session.release(); } catch { /* já liberada */ }
    try { await embedder.close(); } catch { /* já fechada */ }
  }
  const checks = {
    allTiersCompleted: { pass: tiers.every(tier => !tier.run.errors.length && tier.run.done === tier.size && tier.run.failed === 0), actual: tiers.map(tier => ({ size: tier.size, done: tier.run.done, failed: tier.run.failed, errors: tier.run.errors.length })) },
    isolatedSamplesClean: { pass: tiers.every(tier => !tier.isolated || !tier.isolated.isolatedErrors.length), actual: tiers.map(tier => ({ size: tier.size, isolatedErrors: tier.isolated?.isolatedErrors.length ?? 'não medido' })) },
    groupingSavedAllTiers: { pass: tiers.every(tier => tier.run.groupedCount > 0), actual: tiers.map(tier => ({ size: tier.size, grouped: tier.run.groupedCount })) }
  };
  return {
    generatedAt: new Date().toISOString(), mode: 'volume', status: Object.values(checks).every(check => check.pass) ? 'PASS' : 'FAIL',
    command: `npm run benchmark:photos -- --dir "${options.dir}" --sizes ${options.sizes.join(',')}`,
    poolDir: options.dir, poolFiles: pool.length, poolManifest,
    settings: {
      concurrency: CONCURRENCY, model: 'resources/models/dinov2-small.onnx', analysisVersion: ANALYSIS_VERSION,
      faces: 'faceProbe por foto (esbuild + spawn Electron por chamada - limite superior; em produção o modelo roda no processo Electron)',
      isolatedSample: ISOLATED_SAMPLE
    },
    tiers, checks,
    notes: [
      'Réplicas documentadas no manifesto de cada tier (hardlink/cópia de fontes distintas); nenhuma fonte é modificada.',
      'workerResidualMs = max(0, analyzeMs - faceMs - groupMs). Com concorrência 2 há sobreposição; não representa duração exclusiva dos workers.',
      'RAM: soma de WorkingSet64 de processos node+electron amostrada a cada 1,5 s (aproximada).'
    ]
  };
}

async function cacheMode(options, pool) {
  const size = options.sizes[0];
  const dataset = await ensureDataset(pool, options.dir, size);
  const workspace = path.join(root, '.test-tmp/benchmark', 'ws-cache');
  await rm(workspace, { recursive: true, force: true });
  const sampler = startRamSampler();
  let run1 = null, run2 = null, run3 = null, mutation = null, ramPeak = null;
  try {
    console.log('=== Cache: execução 1 (frio) ===');
    run1 = await runPipeline({ workspace, datasetDir: dataset.datasetDir, label: 'cache-1-frio', fresh: false });
    console.log('=== Cache: execução 2 (quente) ===');
    run2 = await runPipeline({ workspace, datasetDir: dataset.datasetDir, label: 'cache-2-quente', fresh: false, projectId: run1.projectId });
    const entry = dataset.manifest.entries[0];
    const entryPath = path.join(dataset.datasetDir, entry.file);
    const sourceShaBefore = await fileSha256(entry.source);
    const originalBytes = await readFile(entryPath);
    await unlink(entryPath);
    let mutated, method = 'sharp-reencode';
    try {
      mutated = path.extname(entryPath).toLowerCase() === '.png' ? await sharp(originalBytes).png({ compressionLevel: 9 }).toBuffer() : await sharp(originalBytes).jpeg({ quality: 40 }).toBuffer();
    } catch { mutated = Buffer.concat([originalBytes, Buffer.from('\n')]); method = 'append-newline'; }
    await writeFile(entryPath, mutated);
    const sourceShaAfter = await fileSha256(entry.source);
    mutation = { entry: entry.file, source: entry.source, method, sourceSha256Before: sourceShaBefore, sourceSha256After: sourceShaAfter, sourceUntouched: sourceShaBefore === sourceShaAfter };
    console.log(`=== Cache: execução 3 (1 arquivo alterado: ${entry.file}) ===`);
    run3 = await runPipeline({ workspace, datasetDir: dataset.datasetDir, label: 'cache-3-mutado', fresh: false, projectId: run1.projectId });
  } finally { ramPeak = stopRamSampler(sampler); }
  const runs = [run1, run2, run3];
  const checks = {
    runsCompletedWithoutError: { pass: runs.every(run => run && !run.errors.length && run.done === size && run.failed === 0), actual: runs.map(run => ({ label: run?.label ?? 'não executado', errors: run?.errors.length ?? 'n/d' })) },
    coldRunMissesAll: { pass: run1 && run1.misses === size, expected: size, actual: run1?.misses },
    warmRunNoRecompute: { pass: run2 && run2.preparedCount === 0, expected: 0, actual: run2?.preparedCount },
    warmRunHitsAll: { pass: run2 && run2.hits === size, expected: size, actual: run2?.hits },
    mutatedRunSingleMiss: { pass: run3 && run3.preparedCount === 1, expected: 1, actual: run3?.preparedCount },
    mutatedRunHitsRest: { pass: run3 && run3.hits === size - 1, expected: size - 1, actual: run3?.hits },
    sourceUntouched: { pass: mutation?.sourceUntouched === true, actual: mutation?.sourceUntouched }
  };
  return {
    generatedAt: new Date().toISOString(), mode: 'cache-test', status: Object.values(checks).every(check => check.pass) ? 'PASS' : 'FAIL',
    command: `npm run benchmark:photos -- --dir "${options.dir}" --cache-test`,
    poolDir: options.dir, size, datasetDir: dataset.datasetDir, replication: dataset.manifest.replication,
    runs: runs.map(run => run && ({
      label: run.label, indexMs: run.indexMs, analyzeMs: run.analyzeMs, firstRunSeconds: Number((run1.analyzeMs / 1000).toFixed(1)),
      pendingBefore: run.pendingBefore, preparedCount: run.preparedCount, hits: run.hits, misses: run.misses,
      done: run.done, failed: run.failed, status: run.status, cacheBytes: run.cacheBytes, errors: run.errors
    })),
    mutation, checks, ramPeakBytesApprox: ramPeak,
    notes: [
      'hit = foto não re-preparada nesta execução (análise anterior aproveitada); miss = foto preparada novamente.',
      'A mutação reescreve apenas a entrada do dataset (unlink + nova escrita); a fonte é verificada por SHA-256 antes e depois.',
      'ws-cache é removido no início para garantir execução 1 fria.'
    ]
  };
}

async function resumeMode(options, pool) {
  const size = options.sizes[0];
  const cancelAtRatio = 0.3;
  const dataset = await ensureDataset(pool, options.dir, size);
  const workspace = path.join(root, '.test-tmp', 'benchmark', 'ws-resume');
  await rm(workspace, { recursive: true, force: true });
  const sampler = startRamSampler();
  let phase1 = null, phase2 = null, ramPeak = null;
  try {
    console.log('=== Retomada: fase 1 (cancelar ~30%) ===');
    phase1 = await runPipeline({ workspace, datasetDir: dataset.datasetDir, label: 'resume-1-cancelar', fresh: false, cancelAtRatio });
    console.log('=== Retomada: fase 2 (reabrir e retomar) ===');
    phase2 = await runPipeline({ workspace, datasetDir: dataset.datasetDir, label: 'resume-2-retomar', fresh: false, projectId: phase1.projectId });
  } finally { ramPeak = stopRamSampler(sampler); }
  const doneBefore = new Set(phase1.doneIds ?? []);
  const duplicates = (phase2.preparedIds ?? []).filter(id => doneBefore.has(id));
  const checks = {
    phase1CancelledInterrupted: { pass: phase1.cancelled === true && phase1.status === 'INTERRUPTED', actual: { cancelled: phase1.cancelled, status: phase1.status } },
    processedApprox30Percent: { pass: phase1.done >= Math.ceil(size * 0.2) && phase1.done <= Math.ceil(size * 0.4), expected: `~30% de ${size}`, actual: phase1.done },
    remainingMatchesPending: { pass: phase2.pendingBefore === size - phase1.done, expected: size - phase1.done, actual: phase2.pendingBefore },
    duplicatesReprocessedZero: { pass: duplicates.length === 0, expected: 0, actual: duplicates.length },
    finalComplete: { pass: phase2.done === size && phase2.failed === 0, expected: `${size} DONE / 0 falhas`, actual: `${phase2.done} DONE / ${phase2.failed} falhas` },
    groupingSaved: { pass: phase2.groupedCount > 0, actual: phase2.groupedCount }
  };
  return {
    generatedAt: new Date().toISOString(), mode: 'resume-test', status: Object.values(checks).every(check => check.pass) ? 'PASS' : 'FAIL',
    command: `npm run benchmark:photos -- --dir "${options.dir}" --resume-test`,
    poolDir: options.dir, size, cancelAtRatio, datasetDir: dataset.datasetDir, replication: dataset.manifest.replication,
    phase1: {
      indexMs: phase1.indexMs, analyzeMs: phase1.analyzeMs, processedBeforeStop: phase1.done, failed: phase1.failed, pending: phase1.pending,
      cancelled: phase1.cancelled, status: phase1.status, cacheBytes: phase1.cacheBytes, errors: phase1.errors
    },
    phase2: {
      indexMs: phase2.indexMs, analyzeMs: phase2.analyzeMs, remainingAfterRestart: phase2.pendingBefore,
      preparedCount: phase2.preparedCount, done: phase2.done, failed: phase2.failed, status: phase2.status,
      groupedCount: phase2.groupedCount, cacheBytes: phase2.cacheBytes, errors: phase2.errors
    },
    duplicates: { ids: duplicates, duplicatesReprocessed: duplicates.length },
    checks, ramPeakBytesApprox: ramPeak,
    notes: [
      'Fase 2 reabre o mesmo banco (nova instância de Store) e reutiliza o mesmo projeto; fotos DONE não são re-preparadas.',
      'duplicatesReprocessed = fotos DONE antes da fase 2 que foram re-preparadas na fase 2 (esperado 0).'
    ]
  };
}

async function writeEvidence(name, stamp, data) {
  await mkdir(path.join(root, 'docs/evidence'), { recursive: true });
  const file = path.join(root, 'docs/evidence', `${name}-${stamp}.json`);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Evidência: ${path.relative(root, file)}`);
  return file;
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    const pool = await collectPool(options.dir);
    if (!pool.length) throw new Error(`Nenhuma imagem .jpg/.jpeg/.png encontrada em ${options.dir}`);
    const poolManifestPath = path.join(options.dir, 'pool-manifest.json');
    const poolManifest = existsSync(poolManifestPath) ? JSON.parse((await readFile(poolManifestPath, 'utf8')).replace(/^\uFEFF/, '')) : null;
    console.log(`Pool: ${pool.length} imagens distintas em ${options.dir}`);
    let evidence = null;
    if (options.mode === 'volume') evidence = await volumeMode(options, pool, poolManifest);
    else if (options.mode === 'cache') evidence = await cacheMode(options, pool);
    else evidence = await resumeMode(options, pool);
    const name = options.mode === 'volume' ? 'benchmark-photos' : options.mode === 'cache' ? 'cache-test' : 'resume-test';
    await writeEvidence(name, stamp, evidence);
    console.log(`\nStatus: ${evidence.status}`);
    if (options.mode === 'volume') {
      for (const tier of evidence.tiers) {
        const run = tier.run;
        console.log(`Tier ${tier.size}: ${run.done}/${run.total} em ${(run.analyzeMs / 1000).toFixed(1)} s (${run.photosPerMinute.toFixed(1)} fotos/min), face médio ${run.faceAvgMs.toFixed(0)} ms, DINOv2 isolado ${tier.isolated?.dinov2AvgMs.toFixed(0) ?? 'n/d'} ms, NIMA isolado ${tier.isolated?.nimaAvgMs.toFixed(0) ?? 'n/d'} ms, preview ${tier.isolated?.previewAvgMs.toFixed(0) ?? 'n/d'} ms, RAM aprox. ${(tier.ramPeakBytesApprox / 1048576).toFixed(0)} MiB, cache ${(run.cacheBytes / 1048576).toFixed(1)} MiB`);
      }
    } else if (options.mode === 'cache') {
      for (const run of evidence.runs) console.log(`${run.label}: ${run.analyzeMs.toFixed(0)} ms | hits=${run.hits} misses=${run.misses} | erros=${run.errors.length}`);
    } else {
      console.log(`Fase 1: ${evidence.phase1.processedBeforeStop} fotos processadas antes do cancelamento (${evidence.phase1.status}).`);
      console.log(`Fase 2: ${evidence.phase2.remainingAfterRestart} restantes -> ${evidence.phase2.done} DONE; duplicatesReprocessed=${evidence.duplicates.duplicatesReprocessed}.`);
    }
    console.log(options.mode === 'volume' ? 'BENCHMARK_DONE' : options.mode === 'cache' ? 'CACHE_TEST_DONE' : 'RESUME_TEST_DONE');
    if (evidence.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.error(error.stack ?? String(error));
    console.log(options.mode === 'volume' ? 'BENCHMARK_DONE_WITH_ERROR' : options.mode === 'cache' ? 'CACHE_TEST_DONE_WITH_ERROR' : 'RESUME_TEST_DONE_WITH_ERROR');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
