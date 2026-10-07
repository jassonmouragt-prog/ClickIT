import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeAnalysis } from '../src/ai/quality.ts';
import { analysisWeights } from '../src/lib/config.ts';
import { contributions } from './selection-report.mjs';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/ranking-audit.mjs <selection evidence.json> [--regional-focus-experiment]');
const bytes = await readFile(source);
const evidence = JSON.parse(bytes);
const replay = JSON.parse(await readFile('docs/evidence/selection-grouping-replay.json', 'utf8'));
if (replay.source !== source) throw new Error('Replay and analyses must have identical provenance.');
const principal = [...replay.groups].sort((a, b) => b.ids.length - a.ids.length)[0];
// No grouping changes; inspect the exact persisted membership from the real replay.
const rows = principal.ids.map((id, index) => {
  const image = evidence.images.find(row => row.id === id);
  const a = image.analysis;
  const rebuilt = makeAnalysis(a.sharpness, a.regionalSharpness, a.exposure, a.faces, a.facesAvailable, a.embeddingAvailable);
  if (rebuilt.version === a.version && rebuilt.overall !== a.overall) throw new Error('Production score does not reproduce saved analysis: ' + image.fileName);
  const weighted = contributions(a);
  if (Math.round(Object.values(weighted).reduce((sum, value) => sum + (value ?? 0), 0)) !== a.overall) throw new Error('Versioned contributions do not reproduce saved score.');
  const denominator = analysisWeights.sharpness + analysisWeights.exposure + (a.faceScore === null ? 0 : analysisWeights.face) + (a.eyesScore === null ? 0 : analysisWeights.eyes);
  // Invert the actual unclipped log transform. This is reconstruction, not a new pixel measurement.
  const variance = score => score >= 100 ? null : 10 ** (score / 20) - 1;
  const row = {
    id, fileName: image.fileName, sha256: image.sha256,
    rawSharpness: { globalLaplacianVarianceReconstructed: variance(a.sharpness), faceLaplacianVarianceReconstructed: a.faceScore === null ? null : variance(a.faceScore), note: 'Raw variance was not persisted. Algebraic inverse of saved unclipped normalization; not a fresh measurement. Regional score averages the two best normalized tiles, so cannot invert to one raw variance.' },
    normalizedSharpness: { global: a.sharpness, regional: a.regionalSharpness, usedForFocus: a.faceScore ?? a.regionalSharpness },
    exposure: a.exposure, faceScore: a.faceScore, eyesScore: a.eyesScore,
    eyes: a.faces.map(face => ({ state: face.eyes, leftEAR: face.leftEyeScore, rightEAR: face.rightEyeScore, confidence: face.eyesConfidence })),
    closedPenaltyVersusOpenUnrounded: a.eyesScore === 20 ? (100 - 20) * analysisWeights.eyes / denominator : 0,
    explicitBlurPenalty: 0, blur: a.blur, relativeScore: null,
    relativeScoreNote: 'No group-relative score. Blur annotation may change after ranking; it does not subtract score.',
    denominator, weighted, unroundedScore: Object.values(weighted).reduce((sum, value) => sum + (value ?? 0), 0),
    finalScore: a.overall, rank: index + 1, decision: principal.rows[index].decision,
    aestheticScore: a.aestheticScore
  };
  if (process.argv.includes('--regional-focus-experiment')) {
    const proposed = { ...weighted, sharpness: a.regionalSharpness * analysisWeights.sharpness / denominator };
    const unroundedScore = Object.values(proposed).reduce((sum, value) => sum + (value ?? 0), 0);
    row.experiment = { weighted: proposed, unroundedScore, finalScore: Math.round(unroundedScore) };
  }
  return row;
});
if (process.argv.includes('--regional-focus-experiment')) {
  [...rows].sort((a, b) => b.experiment.finalScore - a.experiment.finalScore || a.id.localeCompare(b.id)).forEach((row, index) => { row.experiment.rank = index + 1; });
}
const report = { generatedAt: new Date().toISOString(), source, sourceSha256: createHash('sha256').update(bytes).digest('hex'), membershipSource: 'docs/evidence/selection-grouping-replay.json', mode: 'Audit of real saved analyses; no new inference; production code/weights unchanged', weights: analysisWeights, formula: 'round((0.45*focus + 0.20*exposure + optional(0.20*face) + optional(0.15*eyes)) / sum(available weights)); focus=face??regional', normalization: 'clamp(20*log10(1+max(0,mean(L^2)-mean(L)^2)),0,100); L=4*center-left-right-up-down', experiment: process.argv.includes('--regional-focus-experiment') ? 'Only focus input replaced by regionalSharpness; face term and every weight unchanged. Diagnostic proposal, not production.' : null, rows };
const target = `docs/evidence/ranking-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(target, JSON.stringify(report, null, 2), { flag: 'wx' });
console.table(rows.map(row => ({ file: row.fileName, globalRaw: row.rawSharpness.globalLaplacianVarianceReconstructed, faceRaw: row.rawSharpness.faceLaplacianVarianceReconstructed, global: row.normalizedSharpness.global, regional: row.normalizedSharpness.regional, face: row.faceScore, exposure: row.exposure, eyes: row.eyesScore, closedPenalty: row.closedPenaltyVersusOpenUnrounded, focusContribution: row.weighted.sharpness, exposureContribution: row.weighted.exposure, faceContribution: row.weighted.face, eyesContribution: row.weighted.eyes, unrounded: row.unroundedScore, score: row.finalScore, rank: row.rank, experimentScore: row.experiment?.finalScore, experimentRank: row.experiment?.rank })));
console.log(report.formula, '\nEvidence:', target);
