// Provisional static-image operating points, not population-calibrated cutoffs.
// Keep an abstention band; validate CLOSED separately with labelled photographs.
export const EYES = {
  version: 'ear-1',
  landmarks: { left: [362, 385, 387, 263, 373, 380], right: [33, 160, 158, 133, 153, 144] },
  closedMax: 0.18,
  openMin: 0.25,
  minEyeWidthPixels: 12,
  maxPlausibleEar: 0.6,
  confidenceMargin: 0.1,
  formula: 'EAR = (distance(p2,p6) + distance(p3,p5)) / (2 * distance(p1,p4)); distances in image pixels'
} as const;
