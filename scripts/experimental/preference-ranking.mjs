// Experimental two-layer preference ranking. Not production. Never imported by src/.

export const TIER_ORDER = ['TECHNICALLY_GOOD', 'TECHNICALLY_ACCEPTABLE', 'REVIEW', 'TECHNICALLY_WEAK'];

export const nimaPreferenceIndex = (nimaMean) => ((nimaMean - 1) / 9) * 100;

export function technicalTier(signal) {
  const { eyesState, blur, hasOpenAlternative } = signal;
  if (eyesState === 'CLOSED' && hasOpenAlternative) return 'TECHNICALLY_WEAK';
  if (eyesState === 'UNCERTAIN') return 'REVIEW';
  if (eyesState === 'OPEN') return blur === 'CLEAR' ? 'TECHNICALLY_GOOD' : 'TECHNICALLY_ACCEPTABLE';
  if (blur === 'CLEAR') return 'TECHNICALLY_ACCEPTABLE';
  return 'REVIEW';
}

export const CONFIGS = {
  A: { id: 'A', name: 'conservadora', description: 'Técnico domina; estética só desempata.', weights: { GOOD: { tech: 0.85, aes: 0.15 }, ACCEPTABLE: { tech: 0.85, aes: 0.15 }, REVIEW: { tech: 1, aes: 0 }, WEAK: { tech: 1, aes: 0 } }, tierFactor: { TECHNICALLY_GOOD: 1, TECHNICALLY_ACCEPTABLE: 0.9, REVIEW: 0.6, TECHNICALLY_WEAK: 0.4 } },
  B: { id: 'B', name: 'balanceada', description: 'Mistura moderada entre viabilidade técnica e preferência estética.', weights: { GOOD: { tech: 0.65, aes: 0.35 }, ACCEPTABLE: { tech: 0.65, aes: 0.35 }, REVIEW: { tech: 1, aes: 0 }, WEAK: { tech: 1, aes: 0 } }, tierFactor: { TECHNICALLY_GOOD: 1, TECHNICALLY_ACCEPTABLE: 0.9, REVIEW: 0.6, TECHNICALLY_WEAK: 0.4 } },
  C: { id: 'C', name: 'preferência', description: 'Entre fotos tecnicamente boas a estética domina; em tier inferior a técnica pesa mais e estética não resgata REVIEW/WEAK.', weights: { GOOD: { tech: 0.25, aes: 0.75 }, ACCEPTABLE: { tech: 0.7, aes: 0.3 }, REVIEW: { tech: 1, aes: 0 }, WEAK: { tech: 1, aes: 0 } }, tierFactor: { TECHNICALLY_GOOD: 1, TECHNICALLY_ACCEPTABLE: 0.9, REVIEW: 0.6, TECHNICALLY_WEAK: 0.4 } }
};

const weightsFor = (config, tier) => config.weights[tier === 'TECHNICALLY_GOOD' ? 'GOOD' : tier === 'TECHNICALLY_ACCEPTABLE' ? 'ACCEPTABLE' : tier === 'REVIEW' ? 'REVIEW' : 'WEAK'];

export function experimentalScore(photo, config) {
  const weights = weightsFor(config, photo.tier);
  const aestheticIndex = nimaPreferenceIndex(photo.nimaMean);
  const factor = config.tierFactor[photo.tier];
  const technicalContribution = factor * weights.tech * photo.technicalScore;
  const aestheticContribution = factor * weights.aes * aestheticIndex;
  return { aestheticIndex, technicalContribution, aestheticContribution, experimentalFinal: technicalContribution + aestheticContribution };
}

export function rankExperimental(photos, config) {
  const rows = photos.map(photo => {
    const tier = technicalTier(photo);
    return { ...photo, tier, ...experimentalScore({ ...photo, tier }, config) };
  });
  rows.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || b.experimentalFinal - a.experimentalFinal || b.technicalScore - a.technicalScore);
  rows.forEach((row, index) => { row.experimentalRank = index + 1; });
  return rows;
}
