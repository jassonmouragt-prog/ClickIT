import { thresholds, ANALYSIS_VERSION } from '../lib/config.ts';
import { technicalScore } from './technical-score.ts';
import type { Analysis, Face } from '../types/domain.ts';
export function clamp(n: number): number { return Math.max(0, Math.min(100, n)); }
export function sharpness(gray: Uint8Array, width: number, height: number): number {
  let sum = 0, square = 0, count = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const v = 4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - width]! - gray[i + width]!;
    sum += v; square += v * v; count++;
  }
  if (!count) return 0;
  return clamp(20 * Math.log10(1 + Math.max(0, square / count - (sum / count) ** 2)));
}
export function regionalSharpness(gray: Uint8Array, width: number, height: number): number {
  const scores: number[] = [];
  const w = Math.floor(width / 4), h = Math.floor(height / 4);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const region = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) region.set(gray.subarray((gy * h + y) * width + gx * w, (gy * h + y) * width + gx * w + w), y * w);
    scores.push(sharpness(region, w, h));
  }
  scores.sort((a, b) => b - a);
  return ((scores[0] ?? 0) + (scores[1] ?? 0)) / 2;
}
export function exposure(gray: Uint8Array): number {
  let clipped = 0;
  for (const pixel of gray) if (pixel < 6 || pixel > 249) clipped++;
  return clamp(100 * (1 - clipped / Math.max(1, gray.length)));
}
export function makeAnalysis(global: number, regional: number, light: number, faces: Face[], facesAvailable: boolean, embeddingAvailable: boolean): Analysis {
  const usable = faces.filter(f => f.width > 0 && f.height > 0);
  const face = usable.length ? Math.min(...usable.map(f => f.sharpness)) : null;
  const eyes = usable.length ? (usable.some(f => f.eyes === 'CLOSED') ? 20 : usable.every(f => f.eyes === 'OPEN') ? 100 : null) : null;
  const focus = face ?? regional;
  const blur: Analysis['blur'] = focus < thresholds.softFocus ? 'UNCERTAIN' : global < thresholds.clearRegion && focus >= thresholds.clearRegion ? 'DOF_POSSIBLE' : 'CLEAR';
  const { overall } = technicalScore(regional, light, face, eyes);
  const insight = eyes === 20 ? 'Possivelmente olhos fechados. Confira a expressão antes de escolher.' : blur === 'UNCERTAIN' ? 'Poucas regiões nítidas. Pode ser movimento ou intenção artística; revise em 1:1.' : blur === 'DOF_POSSIBLE' ? 'Há regiões nítidas e desfoque em outras áreas. Possível profundidade de campo rasa.' : 'Regiões nítidas detectadas. Compare com as demais fotografias do momento.';
  return { version: ANALYSIS_VERSION, sharpness: global, regionalSharpness: regional, exposure: light, faceScore: face, eyesScore: eyes, aestheticScore: null, overall, blur, confidence: blur === 'UNCERTAIN' ? 0.3 : 0.65, faces, facesAvailable, embeddingAvailable, insight };
}
