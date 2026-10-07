import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Diagnostic JavaScript module, not production.
import { aggregateStages, classifyTier, exitFacts, ElectronMemory, memoryReport, takeFaceResponse } from '../scripts/scale-harness-state.mjs';

test('harness distinguishes requested exit zero, early exit zero, reported failure and native crash', () => {
  const normal = exitFacts({ exitCode: 0, requested: true, acknowledged: true });
  assert.equal(normal.unexpectedExit, false); assert.equal(normal.nativeCrash, false);
  const early = exitFacts({ exitCode: 0 });
  assert.equal(early.unexpectedExit, true); assert.equal(early.nativeCrash, false);
  const failed = exitFacts({ exitCode: 1, reportWritten: true });
  assert.equal(failed.controlledFailure, true); assert.equal(failed.nativeCrash, false);
  assert.equal(exitFacts({ exitCode: 1 }).nativeCrash, false);
  assert.equal(exitFacts({ exitCode: 1 }).unexpectedExit, true);
  assert.equal(exitFacts({ signal: 'SIGTERM' }).nativeCrash, false);
  assert.equal(exitFacts({ signal: 'SIGSEGV' }).nativeCrash, true);
  assert.equal(exitFacts({ exitCode: 1, nativeEvidence: ['FATAL native stack'] }).nativeCrash, true);
  assert.equal(exitFacts({ timeout: true }).timeout, true);
  assert.equal(exitFacts({ processError: 'spawn ENOENT' }).processError, 'spawn ENOENT');
});

test('harness never marks FAIL or missing stages allComplete and preserves blocked resume', () => {
  assert.equal(aggregateStages({ cold: 'PASS', resume: 'BLOCKED' }).classification, 'BLOCKED');
  assert.equal(aggregateStages({ cold: 'FAIL', resume: 'BLOCKED' }).classification, 'BLOCKED');
  for (const state of ['FAIL', 'BLOCKED', 'NOT_RUN', 'NOT_MEASURED']) assert.equal(aggregateStages({ cold: state }).allComplete, false);
  assert.equal(aggregateStages({ cold: 'FAIL' }).classification, 'NEEDS_OPTIMIZATION');
  assert.equal(aggregateStages({ cold: 'PASS', resume: 'PASS' }).allComplete, true);
  assert.equal(aggregateStages({}).allComplete, false);
});

test('host memory invalidates at exit, ignores late samples and expires silence without inventing zero', () => {
  const memory = new ElectronMemory();
  assert.equal(memory.read(0).valid, false);
  memory.update(300, 100); assert.equal(memory.read(101).electronRss, 300);
  assert.equal(memory.read(2200).electronRss, null);
  memory.disconnect(); assert.equal(memory.read(101).valid, false);
  memory.update(400, 200); memory.invalidate(); memory.update(999, 201);
  assert.deepEqual(memory.read(202), { electronRss: 0, valid: true, state: 'exited' });
  const report = memoryReport([{ phase: 'startup', nodeRss: 10, electronRss: 0, totalRss: 10, valid: true }, { phase: 'steady-state', nodeRss: 20, electronRss: null, totalRss: null, valid: false }, { phase: 'shutdown', nodeRss: 11, electronRss: 0, totalRss: 11, valid: true }]);
  assert.equal(report.peak.totalRss, 11); assert.equal(report.invalidSamples, 1);
  assert.equal(report.leakAssessment, 'NOT_MEASURED');
});

test('face protocol correlates exact IDs and rejects duplicate, unknown, malformed and wrong-type responses', () => {
  const a = { type: 'RESPONSE', owner: 'photo-a' }, b = { type: 'RESPONSE', owner: 'photo-b' };
  const pending = new Map([['a', a], ['b', b]]);
  assert.throws(() => takeFaceResponse(pending, { id: 'other', type: 'RESPONSE', ok: true }));
  assert.throws(() => takeFaceResponse(pending, { id: 'a', type: 'SHUTDOWN_ACK', ok: true }));
  assert.throws(() => takeFaceResponse(pending, { id: 'a', type: 'RESPONSE' }));
  assert.equal(pending.size, 2);
  assert.equal(takeFaceResponse(pending, { id: 'b', type: 'RESPONSE', ok: true }).request, b);
  assert.throws(() => takeFaceResponse(pending, { id: 'b', type: 'RESPONSE', ok: true }));
  assert.equal(takeFaceResponse(pending, { id: 'a', type: 'RESPONSE', ok: false, error: 'image failed' }).request, a);
});

const memorySamples = (total: number, invalidCount: number, rssFn: (i: number) => number) => Array.from({ length: total }, (_, i) => {
  const phase = i < 5 ? 'startup' : i >= total - 3 ? 'shutdown' : 'steady-state';
  const invalid = i < invalidCount;
  const rss = rssFn(i);
  return { ms: i * 500, phase, progressCompleted: 0, nodeRss: invalid ? 0 : rss - 100, electronRss: invalid ? null : 100, totalRss: invalid ? null : rss, valid: !invalid, electronState: invalid ? 'unavailable-or-expired' : 'live', heapUsed: 0, arrayBuffers: 0 };
});
const steadySeries = (start: number, end: number, count: number) => Array.from({ length: count }, (_, i) => {
  const rss = start + (end - start) * i / (count - 1);
  return { ms: (i + 1) * 500, phase: 'steady-state', progressCompleted: 0, nodeRss: rss, electronRss: 0, totalRss: rss, valid: true, electronState: 'live', heapUsed: 0, arrayBuffers: 0 };
});
const MIB = 1024 ** 2;

test('memory measurement passes small sample loss and only drops below the coverage floor', () => {
  const r98 = memoryReport(memorySamples(101, 3, () => 500 * MIB));
  assert.equal(r98.status, 'PASS');
  assert.equal(r98.totalSamples, 101); assert.equal(r98.validSamples, 98); assert.equal(r98.invalidSamples, 3);
  assert.equal(r98.coverageRatio, 98 / 101);
  assert.ok(r98.reason.length > 0);
  assert.equal(r98.leakAssessment, 'PASS');
  const r80 = memoryReport(memorySamples(101, 21, () => 500 * MIB));
  assert.equal(r80.status, 'NOT_MEASURED');
  assert.ok(r80.coverageRatio < 0.8);
  assert.ok(r80.reason.includes('below'));
  assert.equal(r80.leakAssessment, 'PASS');
  const r0 = memoryReport(memorySamples(101, 101, () => 500 * MIB));
  assert.equal(r0.status, 'NOT_MEASURED');
  assert.equal(r0.validSamples, 0);
  assert.equal(r0.peak, null);
  assert.equal(r0.leakAssessment, 'NOT_MEASURED');
});

test('leak heuristic keeps stable RSS PASS and scales growth from WARN to FAIL conservatively', () => {
  const stable = memoryReport(steadySeries(500 * MIB, 500 * MIB, 40));
  assert.equal(stable.leakAssessment, 'PASS');
  assert.ok(stable.leak.reason.includes('stable'));
  assert.equal(stable.leak.steadyStateStart, stable.leak.steadyStateEnd);
  const slow = memoryReport(steadySeries(500 * MIB, 650 * MIB, 40));
  assert.equal(slow.leakAssessment, 'WARN');
  const risingButSmall = memoryReport(steadySeries(100 * MIB, 160 * MIB, 40));
  assert.equal(risingButSmall.leakAssessment, 'WARN');
  const clear = memoryReport(steadySeries(500 * MIB, 1500 * MIB, 40));
  assert.equal(clear.leakAssessment, 'FAIL');
  assert.equal(clear.leak.halvesAgree, true);
  assert.ok(clear.leak.windowGrowthBytes >= 256 * MIB);
  assert.ok(clear.leak.reason.includes('MiB over'));
  for (const detail of [stable, slow, clear]) {
    assert.ok(Number.isFinite(detail.leak.steadyStateStart));
    assert.ok(Number.isFinite(detail.leak.steadyStateEnd));
    assert.ok(Number.isFinite(detail.leak.peakRss));
    assert.ok(Number.isFinite(detail.leak.slopeBytesPerMs));
  }
  const startup = memoryReport([{ ms: 0, phase: 'startup', progressCompleted: 0, nodeRss: 300 * MIB, electronRss: 0, totalRss: 300 * MIB, valid: true, electronState: 'live', heapUsed: 0, arrayBuffers: 0 }, ...steadySeries(500 * MIB, 500 * MIB, 40)]);
  assert.equal(startup.leak.startupRss, 300 * MIB);
  const tooFew = memoryReport(steadySeries(500 * MIB, 650 * MIB, 3));
  assert.equal(tooFew.leakAssessment, 'NOT_MEASURED');
  assert.ok(tooFew.leak.reason.includes('fewer than'));
});

test('tier classification separates critical failures from required measurement and observational evidence', () => {
  assert.equal(classifyTier({ cache: 'PASS', export: 'PASS' }).status, 'PASS');
  const fail = classifyTier({ cache: 'FAIL', export: 'PASS' });
  assert.equal(fail.status, 'FAIL'); assert.deepEqual(fail.criticalFailures, ['cache']);
  const block = classifyTier({ cache: 'PASS', memoryMeasurement: 'NOT_MEASURED' });
  assert.equal(block.status, 'BLOCKED'); assert.deepEqual(block.requiredUnmet, ['memoryMeasurement']);
  const covered = classifyTier({ cache: 'PASS', memoryMeasurement: 'WARN' });
  assert.equal(covered.status, 'PASS'); assert.deepEqual(covered.warnings, ['memoryMeasurement']);
  const observational = classifyTier({ cache: 'PASS', memoryLeak: 'NOT_MEASURED' });
  assert.equal(observational.status, 'PASS'); assert.deepEqual(observational.observationalUnmet, ['memoryLeak']);
  const leakFail = classifyTier({ cache: 'PASS', memoryLeak: 'FAIL' });
  assert.equal(leakFail.status, 'BLOCKED'); assert.deepEqual(leakFail.observationalFailures, ['memoryLeak']);
  const unnamed = classifyTier({ someFutureCheck: 'NOT_MEASURED' });
  assert.equal(unnamed.status, 'BLOCKED');
  const limited = classifyTier({ memoryControlled: 'FAIL', cache: 'PASS' });
  assert.equal(limited.status, 'BLOCKED'); assert.deepEqual(limited.requiredUnmet, ['memoryControlled']);
});

test('aggregate ignores observational stages when marked and counts WARN as measured', () => {
  assert.equal(aggregateStages({ cold: 'PASS', memoryLeak: 'NOT_MEASURED' }, ['memoryLeak']).classification, 'READY_FOR_SCALE_BETA');
  assert.equal(aggregateStages({ cold: 'PASS', memoryLeak: 'NOT_MEASURED' }).classification, 'BLOCKED');
  assert.equal(aggregateStages({ memory: 'WARN' }).allComplete, true);
  assert.equal(aggregateStages({ memory: 'WARN' }).classification, 'READY_FOR_SCALE_BETA');
});
