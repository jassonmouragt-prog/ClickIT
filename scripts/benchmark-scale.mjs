import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, readdir, utimes, stat } from 'node:fs/promises';
import { clearTimeout } from 'node:timers';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { Store } from '../src/database/store.ts';
import { exportPhotos } from '../src/services/export.ts';
import { verifyModels } from './models.mjs';
import { args, root, scope, sha256, json, readJson, filesIn, productionFingerprint, groupingMetrics, scales } from './scale-common.mjs';
import { aggregateStages, classifyTier, exitFacts } from './scale-harness-state.mjs';

const evidence = path.join(root, 'docs/evidence');
export const clean = run => !!(run && !run.criticalError && run.exit?.code === 0 && !run.processOutcome?.nativeCrash && !run.processOutcome?.unexpectedExit && !run.processOutcome?.timeout && run.errors?.length === 0 && run.failed?.length === 0 && run.missingAssets === 0 && run.foreignKeys?.length === 0 && run.duplicateRows?.length === 0 && run.integrity?.length && run.integrity.every(row => Object.values(row)[0] === 'ok'));
export async function execute(directory, workspace, label, memoryLimitBytes, stopRatio = null) {
  await mkdir(workspace, { recursive: true });
  const configFile = path.join(workspace, `${label}-config.json`), report = path.join(workspace, `${label}-report.json`);
  await json(configFile, { directory, workspace, label, memoryLimitBytes, stopRatio, report });
  const log = createWriteStream(path.join(workspace, `${label}.log`));
  const child = spawn(process.execPath, [path.join(root, 'scripts/scale-run.mjs'), configFile], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { log.write(chunk); process.stdout.write(chunk); });
  child.stderr.on('data', chunk => log.write(chunk));
  let timeout = false;
  const stopChild = () => {
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === 'win32') {
      // Only the process tree launched by this invocation, never a process-name-wide kill.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill());
    } else child.kill();
  };
  const interrupted = () => { timeout = true; stopChild(); };
  process.once('SIGINT', interrupted);
  const timer = setTimeout(() => { timeout = true; stopChild(); }, 4 * 60 * 60 * 1000);
  const exit = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, error: String(error) }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer); process.off('SIGINT', interrupted); await new Promise(resolve => log.end(resolve));
  let result;
  let reportWritten = true;
  try { result = await readJson(report); }
  catch { reportWritten = false; result = { label, criticalError: 'Child report missing', errors: [], failed: [], total: 0, done: 0, status: 'BLOCKED' }; }
  result.exit = exit;
  result.processOutcome = exitFacts({ exitCode: exit.code, signal: exit.signal ?? null, processError: exit.error ?? null, timeout, reportWritten, requested: reportWritten, acknowledged: reportWritten });
  result.timeout = timeout;
  result.reportFile = report;
  return result;
}
async function exportAudit(workspace, run) {
  const store = new Store(path.join(workspace, 'scale.sqlite'));
  try {
    const photos = store.photos(run.projectId);
    const subset = photos.filter((_p, i) => i % Math.max(1, Math.floor(photos.length / 12)) === 0).slice(0, 12);
    const destination = path.join(workspace, 'export');
    const result = await exportPhotos(subset, destination, 'COPY', () => false, () => {});
    const exported = await readdir(destination), comparisons = [];
    for (const p of subset) {
      const file = exported.find(name => name.includes(`_${p.id.slice(0, 8)}_`) && name.endsWith(p.extension));
      const originalSha256 = await sha256(p.originalPath);
      const exportedSha256 = file ? await sha256(path.join(destination, file)) : null;
      comparisons.push({ source: p.fileName, exported: file ?? null, originalSha256, exportedSha256, identical: originalSha256 === exportedSha256 });
    }
    return { scope: 'Production exportPhotos COPY on a deterministic subset of indexed synthetic files; independent of inference/selection quality.', result, comparisons, pass: subset.length > 0 && result.errors.length === 0 && result.copied === subset.length && comparisons.every(p => p.identical) };
  } finally { store.close(); }
}
async function updateSummary() {
  const tiers = [];
  for (const size of [100, 500, 1000]) {
    try { tiers.push(await readJson(path.join(evidence, `scale-benchmark-${size}.json`))); }
    catch { tiers.push({ size, status: 'NOT_RUN' }); }
  }
  let resume;
  try { resume = await readJson(path.join(evidence, 'scale-resume.json')); } catch { resume = { status: 'NOT_RUN' }; }
  const fingerprintNow = await productionFingerprint();
  const consistentBaseline = tiers.every(t => t.productionFingerprint && JSON.stringify(t.productionFingerprint) === JSON.stringify(fingerprintNow));
  const leakStates = tiers.map(t => t.checks?.memoryLeak).filter(Boolean);
  const memoryLeak = leakStates.length === tiers.length ? leakStates.includes('FAIL') ? 'FAIL' : leakStates.some(s => s === 'WARN') ? 'WARN' : 'PASS' : 'NOT_MEASURED';
  const stages = { productionBaseline: consistentBaseline ? 'PASS' : 'BLOCKED', resume: resume.suite === tiers.find(t => t.size === 1000)?.suite ? resume.status : 'NOT_MEASURED', memoryLeak };
  for (const tier of tiers) {
    stages[`${tier.size}:cold`] = tier.cold?.reportVersion === 2 ? tier.cold.status : tier.status;
    stages[`${tier.size}:cache`] = tier.cache?.status ?? (typeof tier.cache?.pass === 'boolean' ? tier.cache.pass ? 'PASS' : 'FAIL' : 'NOT_MEASURED');
    stages[`${tier.size}:grouping`] = tier.grouping ? 'PASS' : 'NOT_MEASURED';
    stages[`${tier.size}:export`] = tier.export ? tier.export.pass ? 'PASS' : 'FAIL' : 'NOT_MEASURED';
    stages[`${tier.size}:memory`] = tier.cold?.reportVersion === 2 ? tier.cold.memory.status : 'NOT_MEASURED';
    for (const [name, value] of Object.entries(tier.checks ?? {})) stages[`${tier.size}:${name}`] = typeof value === 'boolean' ? value ? 'PASS' : 'FAIL' : value;
  }
  const observational = ['memoryLeak', ...tiers.map(t => `${t.size}:memoryLeak`)];
  const aggregate = aggregateStages(stages, observational), classification = aggregate.classification;
  await json(path.join(evidence, 'scale-summary.json'), { generatedAt: new Date().toISOString(), scope, ...aggregate, consistentBaseline, tiers: tiers.map(t => ({ size: t.size, status: t.status, checks: t.checks })), resume: resume.status, memoryPolicy: 'Measurement coverage >=0.95 PASS, 0.80-0.95 WARN, <0.80 NOT_MEASURED. Leak is a conservative steady-state trend: FAIL only on >=50% relative and >=256 MiB growth; inconclusive remains NOT_MEASURED and is observational, never a functional failure.' });
  await json(path.join(evidence, 'scale-cache.json'), { scope, tiers: tiers.map(t => ({ size: t.size, suite: t.suite, ...(t.cache ?? { status: 'NOT_RUN' }) })) });
  await json(path.join(evidence, 'scale-export.json'), { scope, tiers: tiers.map(t => ({ size: t.size, suite: t.suite, ...(t.export ?? { status: 'NOT_RUN' }) })) });
  return classification;
}
export async function benchmark(directory) {
  directory = path.resolve(directory);
  const manifest = await readJson(path.join(directory, 'dataset-scale-manifest.json'));
  const size = manifest.count;
  if (manifest.schemaVersion !== 1 || !scales.includes(size) || manifest.entries.length !== size) throw new Error('Manifesto sintético inválido');
  if (new Set(manifest.entries.map(e => e.file)).size !== size) throw new Error('Arquivos duplicados no manifesto');
  for (const e of manifest.entries) {
    if (path.basename(e.file) !== e.file || !e.trueGroup || await sha256(path.join(directory, e.file)) !== e.sha256) throw new Error(`SHA/caminho inválido: ${e.file}`);
  }
  const actualImages = (await filesIn(directory)).filter(f => /\.(jpe?g|png|cr2|cr3|nef|arw|raf|dng)$/i.test(f));
  if (actualImages.length !== size) throw new Error('Quantidade real difere do manifesto');
  await mkdir(path.join(root, '.test-tmp/scale-runs'), { recursive: true });
  const suite = await mkdtemp(path.join(root, `.test-tmp/scale-runs/${size}-`));
  const productionBefore = await productionFingerprint();
  const report = { size, directory, suite, scope, manifestSha256: await sha256(path.join(directory, 'dataset-scale-manifest.json')), productionFingerprint: productionBefore, startedAt: new Date().toISOString(), status: 'BLOCKED' };
  const memoryLimitBytes = Math.min(4 * 1024 ** 3, Math.floor(os.totalmem() * 0.7));
  try {
    await verifyModels();
    const workspace = path.join(suite, 'primary');
    console.log(`Scale ${size}: cold (2 workers, face renderer persistente, NIMA diagnóstico)`);
    report.cold = await execute(directory, workspace, 'cold', memoryLimitBytes);
    if (report.cold.projectId) report.export = await exportAudit(workspace, report.cold);
    if (!clean(report.cold) || report.cold.done !== size) throw new Error('Cold não concluiu sem erros; consultar report/log do processo');
    // Labels are consumed only after the unchanged production grouping is persisted.
    report.grouping = groupingMetrics(manifest.entries, report.cold.photos);
    console.log(`Scale ${size}: warm`);
    report.warm = await execute(directory, workspace, 'warm', memoryLimitBytes);
    const e = manifest.entries.find(e => e.transformation !== 'exact-copy') ?? manifest.entries[0];
    const file = path.join(directory, e.file), before = await readFile(file), beforeStat = await stat(file);
    const mutation = { file: e.file, method: 'append diagnostic trailer (bytes and mtime change; image still decodes)', beforeSha256: await sha256(file), expectedMisses: 1 };
    try {
      await writeFile(file, Buffer.concat([before, Buffer.from('\nCLICKIT_SCALE_CACHE_INVALIDATION\n')]));
      mutation.afterSha256 = await sha256(file);
      console.log(`Scale ${size}: invalidar somente ${e.file}`);
      report.mutated = await execute(directory, workspace, 'mutated', memoryLimitBytes);
    } finally {
      await writeFile(file, before); await utimes(file, beforeStat.atime, beforeStat.mtime);
      mutation.restoredSha256 = await sha256(file);
    }
    const changedId = report.cold.photos.find(p => p.fileName === e.file).id;
    report.cache = {
      cold: { cacheHits: report.cold.cacheHits, cacheMisses: report.cold.cacheMisses, ms: report.cold.totalMs },
      warm: { cacheHits: report.warm.cacheHits, cacheMisses: report.warm.cacheMisses, ms: report.warm.totalMs },
      mutation: { ...mutation, actualMisses: report.mutated.cacheMisses, preparedCount: report.mutated.preparedCount, cacheHits: report.mutated.cacheHits, onlyChangedFilePrepared: report.mutated.preparedIds?.length === 1 && report.mutated.preparedIds[0] === changedId },
      speedup: report.cold.totalMs / report.warm.totalMs,
      pass: clean(report.warm) && clean(report.mutated) && report.warm.done === size && report.mutated.done === size && report.cold.cacheMisses === size && report.cold.preparedCount === size && report.warm.cacheHits === size && report.warm.preparedCount === 0 && report.warm.cacheMisses === 0 && report.mutated.cacheMisses === 1 && report.mutated.cacheHits === size - 1 && report.mutated.preparedIds?.length === 1 && report.mutated.preparedIds[0] === changedId && mutation.restoredSha256 === mutation.beforeSha256 && report.warm.totalMs < report.cold.totalMs / 2
    };
    // Leave the mutated workspace honestly PENDING for the restored original, not falsely DONE for old bytes.
    const restoreStore = new Store(path.join(workspace, 'scale.sqlite'));
    try {
      const s = await stat(file);
      restoreStore.index(report.cold.projectId, { path: file, name: path.basename(file), extension: path.extname(file), size: s.size, mtime: s.mtimeMs });
    } finally { restoreStore.close(); }
    if (size === 1000) {
      const resumeWorkspace = path.join(suite, 'resume');
      console.log('Scale 1000: interromper perto de 30% e fechar o processo');
      const first = await execute(directory, resumeWorkspace, 'stop', memoryLimitBytes, 0.3);
      console.log('Scale 1000: novo processo, mesmo SQLite/cache');
      const second = await execute(directory, resumeWorkspace, 'restart', memoryLimitBytes);
      const completed = new Set(first.doneIds ?? []);
      const duplicatesReprocessed = (second.preparedIds ?? []).filter(id => completed.has(id)).length;
      const resume = { scope, suite, first, second, processedBeforeStop: first.done, processedAfterRestart: second.preparedCount, finalDone: second.done, duplicatesReprocessed,
        newProcess: first.pid !== second.pid, persistedIdsPreserved: (first.doneIds ?? []).every(id => second.doneBeforeIds?.includes(id) && second.doneIds?.includes(id)), status: 'FAIL' };
      resume.status = clean(first) && clean(second) && first.cancelled && first.done >= 300 && first.done <= 302 && second.done === 1000 && second.preparedCount === 1000 - first.done && second.cacheHits === first.done && duplicatesReprocessed === 0 && resume.newProcess && resume.persistedIdsPreserved ? 'PASS' : 'FAIL';
      await json(path.join(evidence, 'scale-resume.json'), resume);
      report.resumeStatus = resume.status;
    }
    const productionAfter = await productionFingerprint();
    report.checks = {
      allImagesCompleted: report.cold.done === size && report.cold.total === size && report.cold.preparedCount === size,
      noCrash: [report.cold, report.warm, report.mutated].every(r => !r.processOutcome.nativeCrash && !r.faceHost?.outcome?.nativeCrash),
      memoryControlled: report.cold.memory.peak ? report.cold.memory.peak.totalRss <= memoryLimitBytes : null,
      cache: report.cache.pass, export: report.export.pass,
      persistence: [report.cold, report.warm, report.mutated].every(clean),
      realStages: report.cold.timings.dinov2Calls === size && report.cold.timings.previewCalls === size && report.cold.timings.faceCalls === size && report.cold.timings.nimaCalls === size,
      groupingSaved: report.grouping.coverage === 1,
      productionUnchanged: JSON.stringify(productionBefore) === JSON.stringify(productionAfter),
      resume: size !== 1000 || report.resumeStatus === 'PASS'
    };
    report.checks = Object.fromEntries(Object.entries(report.checks).map(([key, value]) => [key, value === null ? 'NOT_MEASURED' : value ? 'PASS' : 'FAIL']));
    report.checks.memoryMeasurement = report.cold.memory.status;
    report.checks.memoryLeak = report.cold.memory.leakAssessment;
    const tierDecision = classifyTier(report.checks);
    report.status = tierDecision.status;
    report.tierDecision = tierDecision;
  } catch (error) {
    report.error = error.stack ?? String(error);
    report.status = !report.cold || report.cold.criticalError && !(report.cold.done > 0) ? 'BLOCKED' : 'FAIL';
    report.cache ??= { status: 'NOT_RUN', reason: 'Cold pipeline incomplete; no warm/invalidation result can be claimed.', cold: { cacheHits: report.cold?.cacheHits ?? null, cacheMisses: report.cold?.cacheMisses ?? null, completed: report.cold?.done ?? null }, warm: { cacheHits: null, cacheMisses: null, ms: null }, mutation: { expectedMisses: 1, actualMisses: null }, pass: null };
    if (size === 1000) await json(path.join(evidence, 'scale-resume.json'), { scope, suite, status: 'BLOCKED', reason: report.error, processedBeforeStop: null, processedAfterRestart: null, duplicatesReprocessed: null });
  }
  report.finishedAt = new Date().toISOString();
  await json(path.join(suite, 'suite-report.json'), report);
  await json(path.join(evidence, `scale-benchmark-${size}.json`), report);
  await json(path.join(evidence, 'scale-dataset-manifest.json'), manifest);
  const classification = await updateSummary();
  console.log(`Scale ${size}: ${report.status}; classificação agregada: ${classification}`);
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = args(process.argv.slice(2), ['--dir']);
    if (!options['--dir']) throw new Error('Uso: npm run benchmark:scale -- --dir PASTA');
    const result = await benchmark(options['--dir']);
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    const blocker = { generatedAt: new Date().toISOString(), scope, classification: 'BLOCKED', error: error.stack ?? String(error) };
    await json(path.join(evidence, 'scale-blocker.json'), blocker);
    await json(path.join(evidence, 'scale-summary.json'), blocker);
    console.error(error); process.exitCode = 1;
  }
}
