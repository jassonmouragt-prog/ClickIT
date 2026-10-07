import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusUtility, technicalScore } from '../src/ai/technical-score.ts';
import { makeAnalysis } from '../src/ai/quality.ts';

test('focus utility is bounded, monotone and has diminishing marginal returns', () => {
  assert.equal(focusUtility(0), 0); assert.equal(focusUtility(100), 100);
  assert.equal(focusUtility(-10), 0); assert.equal(focusUtility(200), 100);
  let previousGain = Infinity;
  for (let i = 1; i <= 100; i++) {
    const gain = focusUtility(i) - focusUtility(i - 1);
    assert.ok(gain > 0 && gain < previousGain); previousGain = gain;
  }
  assert.ok(focusUtility(35) - focusUtility(20) > 2 * (focusUtility(90) - focusUtility(70)));
});

test('small focus difference between well-focused photos does not overwhelm exposure; CLOSED penalty stays 12', () => {
  const a = technicalScore(70, 95, 70, 100), b = technicalScore(72, 90, 72, 100);
  assert.ok(a.overall > b.overall);
  const closed = technicalScore(70, 95, 70, 20);
  assert.ok(Math.abs(a.unrounded - closed.unrounded - 12) < 1e-10);
});

test('saturation preserves measured sharpness, review flags, absent face semantics and no aesthetics', () => {
  const a = makeAnalysis(8, 12, 90, [], true, true);
  assert.equal(a.sharpness, 8); assert.equal(a.regionalSharpness, 12);
  assert.equal(a.faceScore, null); assert.equal(a.eyesScore, null);
  assert.equal(a.blur, 'UNCERTAIN'); assert.equal(a.aestheticScore, null);
  const score = technicalScore(12, 90, null, null);
  assert.equal(a.overall, score.overall);
  assert.equal(score.denominator, .65);
});
