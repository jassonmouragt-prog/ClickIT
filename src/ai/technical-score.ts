import { analysisWeights, thresholds } from '../lib/config.ts';

// Layer A only. No photographic preference, expression or aesthetic signal.
// Concave, monotone, bounded; anchored to the existing low-focus boundary.
export function focusUtility(value: number): number {
  const s = Math.max(0, Math.min(100, value));
  const k = thresholds.softFocus;
  return (100 + k) * s / (s + k);
}

export function technicalScore(regional: number, exposure: number, face: number | null, eyes: number | null) {
  const values = { sharpness: focusUtility(face ?? regional), exposure, face: face === null ? null : focusUtility(face), eyes };
  const keys = Object.keys(values) as (keyof typeof values)[];
  const denominator = keys.reduce((sum, key) => sum + (values[key] === null ? 0 : analysisWeights[key]), 0);
  const contributions = Object.fromEntries(keys.map(key => [key, values[key] === null ? null : values[key]! * analysisWeights[key] / denominator])) as Record<keyof typeof values, number | null>;
  const unrounded = keys.reduce((sum, key) => sum + (contributions[key] ?? 0), 0);
  return { values, denominator, contributions, unrounded, overall: Math.round(unrounded) };
}
