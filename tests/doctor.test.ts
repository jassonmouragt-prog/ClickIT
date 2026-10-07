import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('.test-tmp', { recursive: true });
test('doctor SQLite probe verifies persistence with a real database', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor-probe.mjs', 'sqlite'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.ok, true);
  assert.equal(report.data.persistence, true);
  assert.match(report.data.version, /^3\./);
});
test('doctor photo probe rejects missing input instead of generating a result', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor-probe.mjs', 'photo', '.test-tmp/does-not-exist.jpg'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.ok, false);
  assert.match(report.error, /ENOENT/);
  assert.equal(report.data, undefined);
});
test('doctor rejects malformed arguments with a non-success exit', () => {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs', '--photo'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Uso:/);
});
