// One independent OS process per run. No synthetic labels are read here.
import { mkdir, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setInterval, clearInterval } from 'node:timers';
import path from 'node:path';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import { validateEmbedding } from '../src/ai/embedding.ts';
import { ANALYSIS_VERSION } from '../src/lib/config.ts';
import { exists } from '../src/lib/files.ts';
import { root, directoryBytes, filesIn, json, readJson } from './scale-common.mjs';
import { faceService } from './scale-face-client.mjs';
import { loadNimaSession, runNima } from './ranking-validate.mjs';
import { memoryReport } from './scale-harness-state.mjs';

const options = await readJson(process.argv[2]);
const { directory, workspace, label, stopRatio = null, memoryLimitBytes } = options;
const started = performance.now(), errors = [], preparedIds = [], memorySamples = [];
const cache = path.join(workspace, 'cache');
await mkdir(cache, { recursive: true });
let store, service, nima, timer, processed = 0, project, pipeline, groupingStarted, analysisStart;
let phase = 'startup', hostDiagnostics = null;
const counters = { indexed: 0, prepared: 0, analysisStarted: 0, done: 0, failed: 0 };
let report = { label, pid: process.pid, errors, criticalError: null, totalMs: null, photosPerMinute: null, averageMsPerImage: null, timings: null, cacheBytes: null, stageStatus: { index: 'NOT_RUN', analysis: 'NOT_RUN' } };
const timings = { faceLandmarkerMs: 0, eyesAndFaceMetricsMs: 0, faceRoundtripMs: 0, nimaMs: 0, faceCalls: 0, facesDetected: 0, nimaCalls: 0 };
const memory = () => {
  const own = process.memoryUsage();
  const electron = hostDiagnostics?.memory ?? { electronRss: 0, valid: true, state: 'not-started' };
  memorySamples.push({ ms: performance.now() - started, phase, progressCompleted: processed, nodeRss: own.rss, electronRss: electron.electronRss, totalRss: electron.valid ? own.rss + electron.electronRss : null, valid: electron.valid, electronState: electron.state, heapUsed: own.heapUsed, arrayBuffers: own.arrayBuffers });
};
try {
  timer = setInterval(memory, 500); memory();
  store = new Store(path.join(workspace, 'scale.sqlite'));
  project = store.projects()[0] ?? store.create('Scale validation', directory);
  report.projectId = project.id;
  if (project.sourcePath !== directory) throw new Error('Workspace pertence a outro dataset');
  const prior = store.photos(project.id);
  const doneBefore = prior.filter(p => p.analysisStatus === 'DONE').map(p => p.id);
  const timingBefore = new Map();
  for (const file of (await filesIn(cache)).filter(f => /timings-\d+\.jsonl$/.test(f))) timingBefore.set(file, (await readFile(file, 'utf8')).length);
  let originals = new Map(), stopRequested = false;
  pipeline = new Pipeline({
    store, model: path.join(root, 'resources/models/dinov2-small.onnx'), concurrency: 2,
    workerFile: path.join(root, 'scripts/scale-analysis-worker.mjs'), groupingFile: path.join(root, 'src/workers/grouping.ts'), cache,
    onPrepared: (id, result) => { validateEmbedding(result.embedding); preparedIds.push(id); counters.prepared++; },
    faces: async (id, preview) => {
      const begin = performance.now();
      const result = await service.detect(preview);
      timings.faceRoundtripMs += performance.now() - begin;
      timings.faceLandmarkerMs += result.detectionMs;
      timings.eyesAndFaceMetricsMs += result.eyesAndFaceMetricsMs;
      timings.faceCalls++; timings.facesDetected += result.faces.length;
      // Diagnostic sidecar only: never included in makeAnalysis, Store.result, grouping or ranking.
      const score = await runNima(nima, originals.get(id));
      timings.nimaMs += score.elapsedMs; timings.nimaCalls++;
      return result.faces;
    },
    emit: progress => {
      if (progress.kind !== 'ANALYSIS') return;
      processed = progress.done;
      counters.done = progress.done - progress.failed; counters.failed = progress.failed;
      if (progress.stage === 'Gerando previews · analisando nitidez e similaridade') counters.analysisStarted++;
      if (progress.stage.includes('criando seleção')) groupingStarted = performance.now();
      if ((progress.done % 10 === 0 || progress.done === progress.total) && progress.stage === 'Analisando fotografias') console.log(`${label}: encerradas ${counters.done + counters.failed}/${progress.total}; DONE=${counters.done} FAILED=${counters.failed}; prepared=${counters.prepared} analysisStarted=${counters.analysisStarted}`);
      if (stopRatio && !stopRequested && progress.active && progress.done >= Math.ceil(progress.total * stopRatio)) { stopRequested = true; pipeline.cancel(); }
    },
    log: (event, details) => errors.push({ event, ...details })
  });
  const indexStart = performance.now(); await pipeline.index(project.id);
  const indexMs = performance.now() - indexStart;
  const indexed = store.photos(project.id);
  counters.indexed = indexed.length;
  report.total = indexed.length;
  report.done = indexed.filter(p => p.analysisStatus === 'DONE').length;
  report.failed = [];
  report.indexMs = indexMs;
  report.stageStatus.index = 'PASS';
  originals = new Map(indexed.map(p => [p.id, p.originalPath]));
  const pending = [];
  for (const p of indexed) if (p.analysisStatus !== 'DONE' || p.analysis?.version !== ANALYSIS_VERSION || !p.analysis?.embeddingAvailable || !p.analysis?.facesAvailable || !await exists(p.previewPath) || !await exists(p.thumbnailPath)) pending.push(p.id);
  report.cacheHits = indexed.length - pending.length;
  report.cacheMisses = pending.length;
  report.preparedCount = 0;
  const initializationStart = performance.now();
  if (pending.length) {
    service = await faceService(path.join(workspace, `face-${label}`), cache, { onDiagnostics: value => { hostDiagnostics = value; } });
    nima = await loadNimaSession();
  }
  const initializationMs = performance.now() - initializationStart;
  report.stageStatus.analysis = 'RUNNING';
  phase = 'steady-state'; memory();
  analysisStart = performance.now(); await pipeline.analyze(project.id);
  const analyzeMs = performance.now() - analysisStart, groupingMs = groupingStarted ? performance.now() - groupingStarted : 0;
  const photos = store.photos(project.id);
  const done = photos.filter(p => p.analysisStatus === 'DONE');
  counters.done = done.length; counters.failed = photos.filter(p => p.analysisStatus === 'FAILED').length;
  report.stageStatus.analysis = pipeline.cancelled ? 'BLOCKED' : counters.done === counters.indexed && counters.failed === 0 ? 'PASS' : 'FAIL';
  let missingAssets = 0;
  for (const p of done) if (!await exists(p.previewPath) || !await exists(p.thumbnailPath)) missingAssets++;
  const workerTimings = [];
  for (const file of (await filesIn(cache)).filter(f => /timings-\d+\.jsonl$/.test(f))) {
    const added = (await readFile(file, 'utf8')).slice(timingBefore.get(file) ?? 0);
    workerTimings.push(...added.trim().split('\n').filter(Boolean).map(s => JSON.parse(s)));
  }
  const totalStage = stage => workerTimings.filter(t => t.stage === stage).reduce((s, t) => s + t.ms, 0);
  const integrity = store.db.prepare('PRAGMA integrity_check').all();
  const foreignKeys = store.db.prepare('PRAGMA foreign_key_check').all();
  const duplicates = store.db.prepare('SELECT originalPath,COUNT(*) n FROM photos GROUP BY projectId,originalPath HAVING COUNT(*)>1').all();
  const totalMs = performance.now() - started;
  report = { ...report, projectId: project.id, total: photos.length, done: done.length, failed: photos.filter(p => p.analysisStatus === 'FAILED').map(p => ({ id: p.id, error: p.error })),
    cancelled: pipeline.cancelled, status: store.project(project.id).status, processedBefore: doneBefore.length,
    cacheHits: indexed.length - pending.length, cacheMisses: pending.length, preparedCount: preparedIds.length, preparedIds,
    doneIds: done.map(p => p.id), doneBeforeIds: doneBefore, indexMs, initializationMs, analyzeMs, totalMs,
    photosPerMinute: done.length / (totalMs / 60000), attemptsPerMinute: (counters.done + counters.failed) / (totalMs / 60000), processedPhotosPerMinute: (done.length - (indexed.length - pending.length)) / (analyzeMs / 60000), averageMsPerImage: done.length ? totalMs / done.length : null,
    timings: { ...timings, dinov2Ms: totalStage('dinov2'), dinov2InferenceMs: workerTimings.filter(t => t.stage === 'dinov2').reduce((s, t) => s + t.inferenceMs, 0), previewMs: totalStage('preview'), previewCalls: workerTimings.filter(t => t.stage === 'preview').length, dinov2Calls: workerTimings.filter(t => t.stage === 'dinov2').length, groupingAndRankingMs: groupingMs },
    cacheBytes: await directoryBytes(cache), integrity, foreignKeys, duplicateRows: duplicates, missingAssets,
    photos: photos.map(p => ({ id: p.id, fileName: p.fileName, groupId: p.groupId, rank: p.rank, status: p.analysisStatus, decision: p.decision })),
    notes: ['NIMA is a sequential diagnostic sidecar on every cache miss; never enters production ranking. Total wall time includes it.', 'Stage sums overlap across 2 workers; do not subtract sums from wall time.', 'Cache hits are persisted valid DONE results plus existing preview/thumbnail, not an inferred total-minus-success count.', 'Interruption uses production cancel at a safe boundary, closes the process, then starts a new process. Not an abrupt power-loss test.'] };
} catch (error) {
  report.stageStatus.analysis = counters.analysisStarted ? 'FAIL' : 'BLOCKED';
  report.criticalError = error.stack ?? String(error); errors.push({ stage: 'run', error: report.criticalError });
}
finally {
  phase = 'shutdown'; memory();
  if (store && project) {
    try {
      const rows = store.photos(project.id);
      counters.done = rows.filter(p => p.analysisStatus === 'DONE').length;
      counters.failed = rows.filter(p => p.analysisStatus === 'FAILED').length;
      report.done = counters.done;
      report.preparedCount = counters.prepared;
      report.failed = rows.filter(p => p.analysisStatus === 'FAILED').map(p => ({ id: p.id, error: p.error }));
    } catch (error) { errors.push({ stage: 'final-persistence-read', error: String(error) }); }
  }
  try { await nima?.session.release(); } catch (error) { errors.push({ stage: 'nima-close', error: String(error) }); }
  try { await service?.close(); } catch (error) { errors.push({ stage: 'face-close', error: String(error) }); }
  try { store?.close(); } catch (error) { errors.push({ stage: 'store-close', error: String(error) }); }
  clearInterval(timer); memory();
  report.memory = { ...memoryReport(memorySamples), limitBytes: memoryLimitBytes };
  report.counters = counters;
  report.faceHost = hostDiagnostics;
  report.reportVersion = 2;
  report.status = report.stageStatus.analysis === 'PASS' && !errors.length ? 'PASS' : report.stageStatus.analysis === 'BLOCKED' || report.stageStatus.analysis === 'NOT_RUN' ? 'BLOCKED' : 'FAIL';
  report.finishedAt = new Date().toISOString();
  report.runtimeUntilShutdownMs = performance.now() - started;
  report.processingWallMs = report.totalMs;
  report.totalMs = report.runtimeUntilShutdownMs;
  report.photosPerMinute = counters.done / (report.totalMs / 60000);
  report.averageMsPerImage = counters.done ? report.totalMs / counters.done : null;
  report.stageMeasurements = {
    faceLandmarker: { status: timings.faceCalls ? 'PASS' : 'NOT_MEASURED', calls: timings.faceCalls, averageMs: timings.faceCalls ? timings.faceLandmarkerMs / timings.faceCalls : null },
    nima: { status: timings.nimaCalls ? 'PASS' : 'NOT_MEASURED', calls: timings.nimaCalls, averageMs: timings.nimaCalls ? timings.nimaMs / timings.nimaCalls : null }
  };
  await json(options.report, report);
}
process.exitCode = report.criticalError || errors.length ? 1 : 0;
