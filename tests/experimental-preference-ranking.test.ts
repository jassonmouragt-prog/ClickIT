import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Experimental JavaScript module has no declaration file.
import { nimaPreferenceIndex, technicalTier, rankExperimental, CONFIGS, TIER_ORDER } from '../scripts/experimental/preference-ranking.mjs';

interface Photo { id: string; fileName: string; sha256: string; technicalScore: number; eyesState: 'OPEN' | 'CLOSED' | 'UNCERTAIN' | null; blur: 'CLEAR' | 'UNCERTAIN' | 'DOF_POSSIBLE'; nimaMean: number; hasOpenAlternative: boolean }
interface ExperimentalConfig { id: string; name: string; weights: Record<'GOOD' | 'ACCEPTABLE' | 'REVIEW' | 'WEAK', { tech: number; aes: number }>; tierFactor: Record<string, number> }
interface RankedRow extends Photo { tier: string; experimentalRank: number; aestheticIndex: number; technicalContribution: number; aestheticContribution: number; experimentalFinal: number }

const configs = CONFIGS as unknown as Record<'A' | 'B' | 'C', ExperimentalConfig>;
const tiers = TIER_ORDER as unknown as string[];
const configsList = Object.values(configs);
const rank = (photos: Photo[], config: ExperimentalConfig): RankedRow[] => rankExperimental(photos, config) as unknown as RankedRow[];
const tier = (candidate: Photo): string => technicalTier(candidate) as unknown as string;
const photo = (id: string, overrides: Partial<Photo>): Photo => ({ id, fileName: `${id}.png`, sha256: id, technicalScore: 70, eyesState: 'OPEN', blur: 'CLEAR', nimaMean: 5, hasOpenAlternative: true, ...overrides });

test('nimaPreferenceIndex is a fixed monotone mapping of the official 1..10 mean to 0..100', () => {
  assert.equal(nimaPreferenceIndex(1), 0);
  assert.equal(nimaPreferenceIndex(5.5), 50);
  assert.equal(nimaPreferenceIndex(10), 100);
  assert.ok(nimaPreferenceIndex(5.25081182905808) < nimaPreferenceIndex(5.388870267868042));
});

test('technicalTier reuses only existing production signals', () => {
  assert.equal(tier(photo('a', { eyesState: 'OPEN', blur: 'CLEAR' })), 'TECHNICALLY_GOOD');
  assert.equal(tier(photo('a', { eyesState: 'OPEN', blur: 'UNCERTAIN' })), 'TECHNICALLY_ACCEPTABLE');
  assert.equal(tier(photo('a', { eyesState: 'OPEN', blur: 'DOF_POSSIBLE' })), 'TECHNICALLY_ACCEPTABLE');
  assert.equal(tier(photo('a', { eyesState: 'UNCERTAIN', blur: 'CLEAR' })), 'REVIEW');
  assert.equal(tier(photo('a', { eyesState: 'CLOSED', blur: 'CLEAR', hasOpenAlternative: true })), 'TECHNICALLY_WEAK');
  assert.equal(tier(photo('a', { eyesState: 'CLOSED', blur: 'CLEAR', hasOpenAlternative: false })), 'TECHNICALLY_ACCEPTABLE');
  assert.equal(tier(photo('a', { eyesState: 'CLOSED', blur: 'UNCERTAIN', hasOpenAlternative: false })), 'REVIEW');
  assert.equal(tier(photo('a', { eyesState: null, blur: 'CLEAR' })), 'TECHNICALLY_ACCEPTABLE');
  assert.equal(tier(photo('a', { eyesState: null, blur: 'UNCERTAIN' })), 'REVIEW');
});

test('layer A dominates: a WEAK photo never outranks a GOOD photo in any config', () => {
  const weak = photo('closed', { technicalScore: 100, eyesState: 'CLOSED', nimaMean: 10, hasOpenAlternative: true });
  const good = photo('open', { technicalScore: 40, eyesState: 'OPEN', nimaMean: 1, hasOpenAlternative: true });
  for (const config of configsList) {
    const ranked = rank([weak, good], config);
    const weakRank = ranked.findIndex((row) => row.id === 'closed') + 1;
    const goodRank = ranked.findIndex((row) => row.id === 'open') + 1;
    assert.ok(goodRank < weakRank, `config ${config.id}: GOOD deve vencer WEAK mesmo com estética/perfis opostos`);
    assert.equal(ranked[0]?.id, 'open');
    assert.equal(ranked.at(-1)?.id, 'closed');
  }
});

test('CONFIGS weights are documented, sum to 1 in mixed tiers and drop aesthetics in REVIEW/WEAK', () => {
  assert.deepEqual(Object.keys(configs).sort(), ['A', 'B', 'C']);
  for (const config of configsList) {
    assert.equal(config.weights.GOOD.tech + config.weights.GOOD.aes, 1);
    assert.equal(config.weights.ACCEPTABLE.tech + config.weights.ACCEPTABLE.aes, 1);
    assert.equal(config.weights.REVIEW.aes, 0);
    assert.equal(config.weights.WEAK.aes, 0);
    assert.equal(config.tierFactor.TECHNICALLY_GOOD, 1);
    assert.ok(config.tierFactor.TECHNICALLY_WEAK! < config.tierFactor.TECHNICALLY_ACCEPTABLE!);
    assert.ok(config.tierFactor.TECHNICALLY_ACCEPTABLE! <= config.tierFactor.TECHNICALLY_GOOD!);
  }
  assert.ok(configs.A.weights.GOOD.aes < configs.B.weights.GOOD.aes);
  assert.ok(configs.B.weights.GOOD.aes < configs.C.weights.GOOD.aes);
});

test('ranking is tier-lexicographic: lower tiers never exceed higher tiers', () => {
  const photos = [
    photo('soft', { technicalScore: 95, blur: 'UNCERTAIN', nimaMean: 10 }),
    photo('sharp', { technicalScore: 40, blur: 'CLEAR', nimaMean: 1 }),
    photo('closed', { technicalScore: 99, eyesState: 'CLOSED', nimaMean: 10 }),
    photo('uncertain', { technicalScore: 98, eyesState: 'UNCERTAIN', nimaMean: 10 })
  ];
  for (const config of configsList) {
    const ranked = rank(photos, config);
    const tierRanks = ranked.map((row) => tiers.indexOf(row.tier));
    assert.deepEqual(tierRanks, [...tierRanks].sort((a, b) => a - b), `config ${config.id}: ordem de tiers monotônica`);
    ranked.forEach((row, index) => assert.equal(row.experimentalRank, index + 1));
  }
});

test('config A is technical-dominant; config C lets aesthetics overcome a small technical gap within GOOD', () => {
  const technical = photo('tech', { technicalScore: 80, eyesState: 'OPEN', blur: 'CLEAR', nimaMean: 5.25 });
  const aesthetic = photo('aes', { technicalScore: 77, eyesState: 'OPEN', blur: 'CLEAR', nimaMean: 5.5 });
  const rankedA = rank([technical, aesthetic], configs.A);
  const rankedC = rank([technical, aesthetic], configs.C);
  assert.equal(rankedA[0]?.id, 'tech', 'config A: vantagem técnica de 3 pontos deve manter a liderança');
  assert.equal(rankedC[0]?.id, 'aes', 'config C: preferência estética dentro do mesmo tier GOOD deve prevalecer');
});

test('experimentalFinal equals tierFactor times weighted contributions', () => {
  const rows = rank([photo('x', { technicalScore: 80, nimaMean: 5.25 })], configs.B);
  const row = rows[0];
  assert.ok(row);
  const factor = configs.B.tierFactor[row.tier]!;
  const expected = factor * (configs.B.weights.GOOD.tech * 80 + configs.B.weights.GOOD.aes * (nimaPreferenceIndex(5.25) as number));
  assert.ok(Math.abs(row.experimentalFinal - expected) < 1e-9);
  assert.ok(Math.abs(row.experimentalFinal - (row.technicalContribution + row.aestheticContribution)) < 1e-9);
});
