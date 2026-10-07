import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Diagnostic JavaScript helper has no declaration file.
import { validateScenario } from '../scripts/selection-report.mjs';
// @ts-expect-error Diagnostic JavaScript helper has no declaration file.
import { parseSelectionArgs } from '../scripts/selection-test.mjs';

test('selection harness requires an explicit directory', () => {
  assert.throws(() => parseSelectionArgs([]));
  assert.throws(() => parseSelectionArgs(['--dir', '--expected']));
  assert.ok(parseSelectionArgs(['--dir', 'Imagens Teste']).endsWith('Imagens Teste'));
});

test('selection harness distinguishes blocked analysis from failed grouping', () => {
  // Assertion-logic records only, never used as real inference evidence.
  const expectations = { images: [{ sha256: 'a', role: 'sequence' }, { sha256: 'b', role: 'sequence' }] };
  assert.equal(validateScenario([], [], expectations)[0].status, 'NOT_EVALUATED');
  const photos = [{ id: 'a', sha256: 'a', analysis: { faces: [] }, groupId: 'one' }, { id: 'b', sha256: 'b', analysis: { faces: [] }, groupId: 'two' }];
  assert.equal(validateScenario(photos, [{ id: 'one', ids: ['a'] }, { id: 'two', ids: ['b'] }], expectations)[0].status, 'FAIL');
  assert.equal(validateScenario([], [], null)[0].status, 'NOT_EVALUATED');
});
