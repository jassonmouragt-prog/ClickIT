import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error JavaScript CLI helpers have no declaration file.
import { parseEyesArgs, allEyesMatch } from '../scripts/eyes-test.mjs';

test('eyes harness requires explicit expected, independent of photo name and option order', () => {
  assert.throws(() => parseEyesArgs(['--photo', 'OPEN.png']));
  for (const expected of ['OPEN', 'CLOSED', 'UNCERTAIN']) {
    assert.equal(parseEyesArgs(['--expected', expected, '--photo', 'FOTO A.png']).expected, expected);
  }
  for (const args of [['--photo', 'A.png', '--expect', 'OPEN'], ['--photo', 'A.png', '--expected', 'BAD'], ['--photo', 'A.png', '--photo', 'B.png']]) assert.throws(() => parseEyesArgs(args));
});

test('eyes harness checks both eyes of every face and never accepts zero/missing faces', () => {
  // Matching-logic fixtures only; these are not inference evidence.
  const open = { leftEyeState: 'OPEN', rightEyeState: 'OPEN', leftEyeScore: .3, rightEyeScore: .3 };
  const closed = { leftEyeState: 'CLOSED', rightEyeState: 'CLOSED', leftEyeScore: .02, rightEyeScore: .02 };
  assert.equal(allEyesMatch([closed], 1, 'CLOSED'), true);
  assert.equal(allEyesMatch([closed], 1, 'OPEN'), false);
  assert.equal(allEyesMatch([open, closed], 2, 'OPEN'), false);
  assert.equal(allEyesMatch([open, { ...open, rightEyeState: 'CLOSED' }], 2, 'OPEN'), false);
  assert.equal(allEyesMatch([open, open], 2, 'OPEN'), true);
  assert.equal(allEyesMatch([], 0, 'OPEN'), false);
  assert.equal(allEyesMatch([open], 2, 'OPEN'), false);
  assert.equal(allEyesMatch([{ ...open, leftEyeScore: NaN }], 1, 'OPEN'), false);
  assert.equal(allEyesMatch([{ leftEyeState: 'UNCERTAIN', rightEyeState: 'UNCERTAIN', leftEyeScore: null, rightEyeScore: .22 }], 1, 'UNCERTAIN'), true);
});
