import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEyes, type EyePoint } from '../src/ai/eyes.ts';
import { EYES } from '../src/ai/eyes-config.ts';

// Analytic geometry fixtures test the formula only, never model inference or photographic accuracy.
function geometry(leftEar: number, rightEar: number, width = 1000, height = 500): EyePoint[] {
  const points: EyePoint[] = [];
  for (const [indices, ear, origin] of [[EYES.landmarks.left, leftEar, 300], [EYES.landmarks.right, rightEar, 600]] as const) {
    const eye = [[0, 0], [30, -50 * ear], [70, -50 * ear], [100, 0], [70, 50 * ear], [30, 50 * ear]];
    indices.forEach((index, i) => { points[index] = { x: (origin + eye[i]![0]!) / width, y: (200 + eye[i]![1]!) / height }; });
  }
  return points;
}
test('EAR uses pixel aspect ratio and classifies each eye independently', () => {
  const result = classifyEyes(geometry(.3, .1), 1000, 500);
  assert.ok(Math.abs(result.leftEyeScore! - .3) < 1e-10);
  assert.ok(Math.abs(result.rightEyeScore! - .1) < 1e-10);
  assert.equal(result.leftEyeState, 'OPEN'); assert.equal(result.rightEyeState, 'CLOSED');
  assert.equal(result.eyes, 'UNCERTAIN'); assert.equal(result.confidence, 0);
  const scaled = classifyEyes(geometry(.3, .1), 2000, 1000);
  assert.equal(scaled.leftEyeScore, result.leftEyeScore);
});
test('EAR abstains on missing, degenerate, out-of-frame, implausible and ambiguous geometry', () => {
  assert.equal(classifyEyes([], 1000, 500).eyes, 'UNCERTAIN');
  assert.equal(classifyEyes(geometry(.22, .22), 1000, 500).eyes, 'UNCERTAIN');
  assert.equal(classifyEyes(geometry(.3, .3), 10, 5).eyes, 'UNCERTAIN');
  assert.equal(classifyEyes(geometry(.9, .9), 1000, 500).eyes, 'UNCERTAIN');
  const points = geometry(.3, .3); points[EYES.landmarks.left[0]] = { x: NaN, y: .5 };
  assert.equal(classifyEyes(points, 1000, 500).leftEyeScore, null);
});
test('EAR open/closed geometry and confidence margin; not a real CLOSED validation', () => {
  assert.equal(classifyEyes(geometry(.3, .3), 1000, 500).eyes, 'OPEN');
  assert.equal(classifyEyes(geometry(.1, .1), 1000, 500).eyes, 'CLOSED');
  assert.ok(classifyEyes(geometry(.35, .35), 1000, 500).confidence > classifyEyes(geometry(.27, .27), 1000, 500).confidence);
});
