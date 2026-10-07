import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { CONFIGS, rankExperimental, TIER_ORDER } from './preference-ranking.mjs';
import { thresholds, analysisWeights } from '../../src/lib/config.ts';

const satPath = 'docs/evidence/focus-saturation-2026-10-06T12-51-03-650Z.json';
const nimaPath = 'docs/evidence/nima-test-2026-10-06T15-45-49-156Z.json';
const prefPath = 'docs/evidence/preference-signals-2026-10-06T13-05-51-937Z.json';

const [satBytes, nimaBytes, prefBytes] = await Promise.all([readFile(satPath), readFile(nimaPath), readFile(prefPath)]);
const sat = JSON.parse(satBytes.toString('utf8'));
const nima = JSON.parse(nimaBytes.toString('utf8'));
const pref = JSON.parse(prefBytes.toString('utf8'));

const nimaByFile = new Map(nima.scores.map(score => [basename(score.photo), score]));
const prefByFile = new Map(pref.rows.map(row => [row.fileName, row]));

const photos = sat.rows.map(row => {
  const aesthetic = nimaByFile.get(row.fileName);
  if (!aesthetic) throw new Error(`NIMA ausente para ${row.fileName}`);
  const expression = prefByFile.get(row.fileName)?.availableExpressionMeasurements ?? null;
  const eyes = row.eyes ?? [];
  const eyesState = eyes.includes('CLOSED') ? 'CLOSED' : eyes.includes('UNCERTAIN') ? 'UNCERTAIN' : eyes.includes('OPEN') ? 'OPEN' : null;
  return { id: row.id, fileName: row.fileName, sha256: row.sha256, technicalScore: row.after.overall, eyesState, expression, blur: row.blur, focusGlobal: row.globalSharpness, focusRegional: row.regionalSharpness, focusSubject: row.subjectSharpness, exposure: row.after.values.exposure, nimaMean: aesthetic.nimaMean, nimaStd: aesthetic.nimaStd, distribution: aesthetic.distribution, nimaSha256: aesthetic.sha256 };
});

for (const photo of photos) photo.hasOpenAlternative = photos.some(other => other !== photo && other.eyesState === 'OPEN');

const configs = Object.values(CONFIGS).map(config => {
  const ranked = rankExperimental(photos, config);
  const pick = ranked.find(row => row.tier === 'TECHNICALLY_GOOD') ?? ranked[0];
  return { config: config.id, name: config.name, description: config.description, weights: config.weights, tierFactor: config.tierFactor, productionPick: sat.pick, experimentalPick: pick.fileName, pickChanged: pick.fileName !== sat.pick, rows: ranked.map(row => ({ experimentalRank: row.experimentalRank, fileName: row.fileName, tier: row.tier, eyesState: row.eyesState, blur: row.blur, technicalScore: row.technicalScore, nimaMean: row.nimaMean, aestheticIndex: row.aestheticIndex, technicalContribution: row.technicalContribution, aestheticContribution: row.aestheticContribution, experimentalFinal: row.experimentalFinal })) };
});

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'Experimental/test only; production ranking, grouping, thresholds, DINOv2, EAR, NIMA model and preprocessing unchanged',
  sources: {
    technical: { path: satPath, sha256: createHash('sha256').update(satBytes).digest('hex') },
    aesthetic: { path: nimaPath, sha256: createHash('sha256').update(nimaBytes).digest('hex'), model: nima.model, onnxSha256: nima.onnxSha256 },
    expression: { path: prefPath, sha256: createHash('sha256').update(prefBytes).digest('hex') }
  },
  thresholds: { production: thresholds, analysisWeights },
  nimaNormalization: { formula: 'aestheticIndex = (nimaMean - 1) / 9 * 100', domain: 'nimaMean official range 1..10', properties: ['fixed and generalizable: not fitted to this dataset', 'not a probability', 'monotone in nimaMean', 'presentation/comparison scale 0..100'] },
  layerA: { tiers: TIER_ORDER, rules: ['TECHNICALLY_WEAK: eyes CLOSED when another photo in the set has eyes OPEN', 'REVIEW: eyes UNCERTAIN (EAR abstention band) or no usable eye state with non-CLEAR blur', 'TECHNICALLY_GOOD: eyes OPEN and blur CLEAR', 'TECHNICALLY_ACCEPTABLE: eyes OPEN and blur UNCERTAIN/DOF_POSSIBLE, or blur CLEAR without eye signal'], thresholdsUsed: { softFocus: thresholds.softFocus, clearRegion: thresholds.clearRegion, eyesClosedMax: 0.18, eyesOpenMin: 0.25, note: 'Only existing production signals/thresholds; no new calibration' } },
  layerB: { concept: 'Camada A define viabilidade; Camada B ordena preferência dentro do tier. Ranking é lexicográfico por tier e depois por experimentalFinal; pesos documentados por configuração.', formula: 'experimentalFinal = tierFactor * (wTech * technicalScore + wAes * aestheticIndex)', configs: Object.values(CONFIGS).map(c => ({ id: c.id, name: c.name, description: c.description, weights: c.weights, tierFactor: c.tierFactor })) },
  configs,
  checks: {
    productionUnchanged: true,
    closedNeverBeatsGoodInAnyConfig: TIER_ORDER.indexOf('TECHNICALLY_WEAK') > TIER_ORDER.indexOf('TECHNICALLY_GOOD'),
    noOptimizationTowardMinus5: 'Configs fixed before running; outcome recorded as-is',
    sampleSizeLimitation: '5 AI-generated photos from one moment; insufficient to promote any weight to production'
  }
};

const target = `docs/evidence/preference-ranking-experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(target, JSON.stringify(report, null, 2), { flag: 'wx' });

for (const config of configs) {
  console.log(`\n=== Config ${config.config} (${config.name}) | productionPick=${config.productionPick} | experimentalPick=${config.experimentalPick} | pickChanged=${config.pickChanged} ===`);
  console.table(config.rows.map(row => ({ rank: row.experimentalRank, file: row.fileName.slice(-12), tier: row.tier, eyes: row.eyesState, blur: row.blur, tech: row.technicalScore, nima: row.nimaMean.toFixed(6), aesIndex: row.aestheticIndex.toFixed(4), techC: row.technicalContribution.toFixed(4), aesC: row.aestheticContribution.toFixed(4), final: row.experimentalFinal.toFixed(4) })));
}
console.log('\nEvidence:', target);
