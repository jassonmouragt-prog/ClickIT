// Harness-only reporting contracts; no production policy.
export function exitFacts({ exitCode = null, signal = null, requested = false, acknowledged = false, reportWritten = false, timeout = false, processError = null, nativeEvidence = [] } = {}) {
  const nativeCrash = nativeEvidence.length > 0 || ['SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGABRT', 'SIGFPE'].includes(signal);
  const controlledFailure = !nativeCrash && !timeout && exitCode !== null && exitCode !== 0 && reportWritten;
  return { exitCode, signal, processError, controlledFailure, unexpectedExit: !processError && !timeout && !controlledFailure && !(requested && acknowledged && exitCode === 0 && signal === null), nativeCrash, timeout, nativeEvidence };
}
export function aggregateStages(stages, observational = []) {
  const values = Object.entries(stages).filter(([name]) => !observational.includes(name)).map(([, value]) => value);
  const allComplete = values.length > 0 && values.every(s => s === 'PASS' || s === 'WARN');
  const blocked = !values.length || values.some(s => ['BLOCKED', 'NOT_RUN', 'NOT_MEASURED'].includes(s));
  return { stages, allComplete, classification: allComplete ? 'READY_FOR_SCALE_BETA' : blocked ? 'BLOCKED' : 'NEEDS_OPTIMIZATION' };
}
export function takeFaceResponse(pending, message) {
  const id = message.type === 'READY' ? 'ready' : message.id;
  const request = pending.get(id);
  if (!request) throw new Error(`Unexpected/duplicate response id=${id}`);
  if (request.type !== message.type) throw new Error(`Response type mismatch id=${id}: ${message.type}`);
  if (message.type !== 'READY' && typeof message.ok !== 'boolean') throw new Error(`Response missing ok id=${id}`);
  pending.delete(id);
  return { id, request };
}
export class ElectronMemory {
  alive = true;
  last = null;
  update(bytes, now = Date.now()) { if (this.alive && Number.isFinite(bytes) && bytes >= 0) this.last = { bytes, at: now }; }
  invalidate() { this.alive = false; this.last = null; }
  disconnect() { this.last = null; }
  read(now = Date.now()) {
    if (!this.alive) return { electronRss: 0, valid: true, state: 'exited' };
    if (!this.last || now - this.last.at > 2000) return { electronRss: null, valid: false, state: 'unavailable-or-expired' };
    return { electronRss: this.last.bytes, valid: true, state: 'live' };
  }
}
export const COVERAGE_PASS_THRESHOLD = 0.95;
export const COVERAGE_MIN_THRESHOLD = 0.80;
export const LEAK_WARN_RATIO = 0.20;
export const LEAK_FAIL_RATIO = 0.50;
export const LEAK_FAIL_BYTES = 256 * 1024 ** 2;
export const LEAK_MIN_STEADY_SAMPLES = 4;
export const CHECK_SEVERITY = {
  allImagesCompleted: 'CRITICAL',
  noCrash: 'CRITICAL',
  persistence: 'CRITICAL',
  cache: 'CRITICAL',
  export: 'CRITICAL',
  realStages: 'CRITICAL',
  groupingSaved: 'CRITICAL',
  productionUnchanged: 'CRITICAL',
  resume: 'CRITICAL',
  memoryControlled: 'REQUIRED',
  memoryMeasurement: 'REQUIRED',
  memoryLeak: 'OBSERVATIONAL'
};
export function classifyTier(checks) {
  const criticalFailures = [], criticalNotPass = [], requiredUnmet = [], observationalFailures = [], observationalUnmet = [], warnings = [];
  for (const [name, status] of Object.entries(checks)) {
    const severity = CHECK_SEVERITY[name] ?? 'CRITICAL';
    if (status === 'PASS') continue;
    if (severity === 'CRITICAL') { if (status === 'FAIL') criticalFailures.push(name); else criticalNotPass.push(name); }
    else if (severity === 'REQUIRED') { if (status === 'WARN') warnings.push(name); else requiredUnmet.push(name); }
    else if (status === 'FAIL') observationalFailures.push(name);
    else if (status === 'WARN') warnings.push(name);
    else observationalUnmet.push(name);
  }
  const status = criticalFailures.length ? 'FAIL' : criticalNotPass.length || requiredUnmet.length || observationalFailures.length ? 'BLOCKED' : 'PASS';
  return { status, criticalFailures, criticalNotPass, requiredUnmet, observationalFailures, observationalUnmet, warnings };
}
export function assessLeak(samples) {
  const steady = samples.filter(s => s.phase === 'steady-state' && s.valid && Number.isFinite(s.totalRss) && Number.isFinite(s.ms)).sort((a, b) => a.ms - b.ms);
  const startupRss = samples.find(s => s.phase === 'startup' && s.valid && Number.isFinite(s.totalRss))?.totalRss ?? null;
  const detail = { assessment: 'NOT_MEASURED', reason: null, startupRss, steadyStateStart: null, steadyStateEnd: null, peakRss: null, steadySamples: steady.length, slopeBytesPerMs: null, windowGrowthBytes: null, windowGrowthRatio: null, halvesAgree: null };
  if (steady.length < LEAK_MIN_STEADY_SAMPLES) return { ...detail, reason: `fewer than ${LEAK_MIN_STEADY_SAMPLES} valid steady-state samples (${steady.length})` };
  const first = steady[0], last = steady.at(-1), spanMs = last.ms - first.ms;
  if (spanMs <= 0) return { ...detail, reason: 'steady-state window has no time span' };
  const meanR = steady.reduce((s, p) => s + p.totalRss, 0) / steady.length;
  const meanT = steady.reduce((s, p) => s + p.ms, 0) / steady.length;
  let ssTT = 0, ssTR = 0;
  for (const p of steady) { const dt = p.ms - meanT, dr = p.totalRss - meanR; ssTT += dt * dt; ssTR += dt * dr; }
  if (ssTT === 0) return { ...detail, reason: 'steady-state samples share a single timestamp' };
  const slope = ssTR / ssTT, windowGrowth = slope * spanMs;
  const baseline = meanR > 0 ? meanR : first.totalRss;
  if (baseline <= 0) return { ...detail, reason: 'baseline RSS is not positive; cannot compute growth' };
  const ratio = windowGrowth / baseline;
  const half = Math.floor(steady.length / 2);
  const firstHalf = steady.slice(0, half).reduce((s, p) => s + p.totalRss, 0) / half;
  const secondHalf = steady.slice(half).reduce((s, p) => s + p.totalRss, 0) / (steady.length - half);
  const halvesAgree = secondHalf > firstHalf;
  const peakRss = Math.max(...steady.map(p => p.totalRss));
  const sign = n => (n >= 0 ? '+' : '-');
  const growthPrefix = `${sign(windowGrowth)}${Math.round(Math.abs(windowGrowth) / 1024 ** 2)} MiB over ${Math.round(spanMs)} ms (${sign(ratio)}${Math.round(Math.abs(ratio) * 100)}% relative)`;
  const built = { ...detail, steadyStateStart: first.totalRss, steadyStateEnd: last.totalRss, peakRss, slopeBytesPerMs: slope, windowGrowthBytes: windowGrowth, windowGrowthRatio: ratio, halvesAgree };
  if (halvesAgree && ratio >= LEAK_FAIL_RATIO && windowGrowth >= LEAK_FAIL_BYTES) return { ...built, assessment: 'FAIL', reason: `persistent steady-state growth: ${growthPrefix}` };
  if (ratio >= LEAK_WARN_RATIO) return { ...built, assessment: 'WARN', reason: `moderate steady-state growth: ${growthPrefix}` };
  return { ...built, assessment: 'PASS', reason: `steady-state RSS stable: ${growthPrefix}` };
}
export function memoryReport(samples) {
  const valid = samples.filter(s => s.valid && Number.isFinite(s.totalRss));
  const totalSamples = samples.length, validSamples = valid.length, invalidSamples = samples.length - valid.length;
  const coverageRatio = totalSamples ? validSamples / totalSamples : 0;
  const pct = ratio => `${Math.round(ratio * 1000) / 10}%`;
  let status, reason;
  if (!totalSamples) { status = 'NOT_MEASURED'; reason = 'no memory samples collected'; }
  else if (!validSamples) { status = 'NOT_MEASURED'; reason = `no valid memory sample (coverage ${pct(coverageRatio)})`; }
  else if (coverageRatio >= COVERAGE_PASS_THRESHOLD) { status = 'PASS'; reason = `coverage ${pct(coverageRatio)} >= ${pct(COVERAGE_PASS_THRESHOLD)}`; }
  else if (coverageRatio >= COVERAGE_MIN_THRESHOLD) { status = 'WARN'; reason = `coverage ${pct(coverageRatio)} in ${pct(COVERAGE_MIN_THRESHOLD)}-${pct(COVERAGE_PASS_THRESHOLD)} range`; }
  else { status = 'NOT_MEASURED'; reason = `coverage ${pct(coverageRatio)} below ${pct(COVERAGE_MIN_THRESHOLD)} minimum`; }
  const phases = {};
  for (const phase of ['startup', 'steady-state', 'shutdown']) {
    const subset = samples.filter(s => s.phase === phase), usable = subset.filter(s => s.valid && Number.isFinite(s.totalRss));
    phases[phase] = { samples: subset.length, validSamples: usable.length, first: usable[0] ?? null, last: usable.at(-1) ?? null, peakTotalRss: usable.length ? Math.max(...usable.map(s => s.totalRss)) : null };
  }
  const leak = assessLeak(samples);
  return { status, totalSamples, validSamples, invalidSamples, coverageRatio, reason, peak: valid.length ? valid.reduce((a, b) => a.totalRss > b.totalRss ? a : b) : null, phases, leakAssessment: leak.assessment, leak, note: 'Leak heuristic uses valid steady-state samples only (startup/model-load/shutdown excluded). Conservative FAIL requires >=50% relative and >=256 MiB absolute growth across the steady window with second half above first half; <=20% is PASS. Node RSS includes workers; Electron working sets approximate RSS and may double-count shared pages. ExifTool/orchestrator excluded.', samples };
}
