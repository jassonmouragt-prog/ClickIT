export const ANALYSIS_VERSION = 'clickit-1-dinov2-mp1-ear1-focus-saturation1';
export const LIMITS = { preview: 1600, thumbnail: 420, analysis: 512, minFacePixels: 42, faceTimeout: 60000, neighborWindow: 24, temporalSeconds: 12, similarity: 0.91, visualOnlySimilarity: 0.965, maxWorkers: 4 } as const;
export const analysisWeights = { sharpness: 0.45, exposure: 0.2, face: 0.2, eyes: 0.15 } as const;
export const thresholds = { softFocus: 27, clearRegion: 48, relativeFocusRatio: 0.6 } as const;
