import { EYES } from './eyes-config.ts';
export type EyeState = 'OPEN' | 'CLOSED' | 'UNCERTAIN';
export interface EyePoint { x: number; y: number }
export interface EyeMeasurement { score: number | null; state: EyeState; confidence: number; reason: string; points: { index: number; x: number; y: number }[] }

function measure(landmarks: readonly EyePoint[], indices: readonly number[], width: number, height: number): EyeMeasurement {
  const uncertain = (reason: string, score: number | null = null, points: EyeMeasurement['points'] = []): EyeMeasurement => ({ score, state: 'UNCERTAIN', confidence: 0, reason, points });
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) return uncertain('invalid-image-size');
  const points: EyeMeasurement['points'] = [];
  for (const index of indices) {
    const p = landmarks[index];
    if (!p || ![p.x, p.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return uncertain('missing-or-invalid-landmark');
    points.push({ index, x: p.x * width, y: p.y * height });
  }
  const distance = (a: number, b: number) => Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y);
  const eyeWidth = distance(0, 3);
  if (eyeWidth < EYES.minEyeWidthPixels) return uncertain('eye-too-small-or-degenerate', null, points);
  const score = (distance(1, 5) + distance(2, 4)) / (2 * eyeWidth);
  if (!Number.isFinite(score) || score > EYES.maxPlausibleEar) return uncertain('implausible-geometry', null, points);
  const state = score <= EYES.closedMax ? 'CLOSED' : score >= EYES.openMin ? 'OPEN' : 'UNCERTAIN';
  const margin = state === 'OPEN' ? score - EYES.openMin : state === 'CLOSED' ? EYES.closedMax - score : 0;
  // Geometric margin only: NOT probability, visibility or model confidence.
  return { score, state, confidence: Math.min(1, Math.max(0, margin / EYES.confidenceMargin)), reason: state === 'UNCERTAIN' ? 'threshold-band' : 'ear-threshold', points };
}
export function classifyEyes(landmarks: readonly EyePoint[], width: number, height: number) {
  const left = measure(landmarks, EYES.landmarks.left, width, height);
  const right = measure(landmarks, EYES.landmarks.right, width, height);
  const eyes: EyeState = left.state === right.state ? left.state : 'UNCERTAIN';
  const confidence = eyes === 'UNCERTAIN' ? 0 : Math.min(left.confidence, right.confidence);
  return { left, right, leftEyeScore: left.score, rightEyeScore: right.score, leftEyeState: left.state, rightEyeState: right.state, eyes, confidence, eyesConfidence: confidence, method: EYES.version };
}
