export type SliderValue = number;
export type ParamKind = 'MODEL_DELTA' | 'DERIVED_DELTA';
export interface EditingProfileQuantitative {
  temperaturePreference: SliderValue | null; tintPreference: SliderValue | null;
  exposurePreference: SliderValue | null; contrastPreference: SliderValue | null;
  highlightsPreference: SliderValue | null; shadowsPreference: SliderValue | null;
  whitesPreference: SliderValue | null; blacksPreference: SliderValue | null;
  saturationPreference: SliderValue | null; vibrancePreference: SliderValue | null;
  clarityPreference: SliderValue | null; texturePreference: SliderValue | null;
  sharpeningPreference: SliderValue | null; grainPreference: SliderValue | null;
  vignettePreference: SliderValue | null;
}
export interface EditingProfileConceptual {
  skinToneStyle: 'NEUTRAL' | 'WARM' | 'COOL' | 'NATURAL' | null;
  greensStyle: 'NATURAL' | 'SOFT' | 'DESATURATED' | 'JUICY' | null;
  bluesStyle: 'NATURAL' | 'MUTED' | 'DEEP' | null;
  blackPointStyle: 'WASHED' | 'NATURAL' | 'DEEP' | null;
  highlightStyle: 'SOFT' | 'NATURAL' | 'BRIGHT' | null;
  overallMood: 'CLEAN' | 'EDITORIAL' | 'FILM' | 'DRAMATIC' | 'NATURAL' | null;
}
export interface EditingProfile {
  id: string; name: string; profileVersion: number;
  source: 'QUESTIONNAIRE' | 'PRESET' | 'MANUAL'; presetPath: string | null;
  createdAt: string; updatedAt: string;
  q: EditingProfileQuantitative; c: EditingProfileConceptual;
}
export type EditingProfileInput = Pick<EditingProfile, 'name' | 'source' | 'presetPath' | 'q' | 'c'>;
export type EditingPlanStatus = 'DRAFT' | 'GENERATED' | 'REVIEWED' | 'EXPORTED' | 'STALE';
export interface EditingAdjustment {
  param: keyof EditingProfileQuantitative; value: SliderValue;
  reason: 'PROFILE_BASE' | 'PROFILE_DERIVED' | 'SCENE' | 'USER'; note: string;
}
export interface EditingPlan {
  id: string; sourcePhotoId: string; sourceOriginalPath: string; profileId: string;
  profileVersion: number; engineVersion: number; inputFingerprint: string;
  generatedAt: string | null; createdAt: string; updatedAt: string;
  baseStyle: EditingAdjustment[]; sceneCorrection: EditingAdjustment[]; finalAdjustment: EditingAdjustment[];
  explanation: EditingExplanation[]; sceneAdvisories: SceneAdvisory[]; missingSignals: SceneSignalKey[];
  status: EditingPlanStatus; statusHistory: { status: EditingPlanStatus; at: string }[];
  xmpPath: string | null;
}
export interface EditingExplanation {
  param: keyof EditingProfileQuantitative; base: number; scene: number; final: number; note: string;
}
export interface SceneAdvisory { kind: 'ADVISORY' | 'OBSERVATION'; signal: SceneSignalKey; message: string }
export type SceneSignalKey = keyof SceneSignals;
export interface EditingPlanView {
  plan: EditingPlan; profileName: string;
  photo: { id: string; fileName: string; previewUrl: string; originalPath: string };
}
export type PlanScope =
  | { kind: 'PHOTO'; photoId: string }
  | { kind: 'SELECTED' | 'PICKS' | 'FAVORITES' | 'ALL'; projectId: string };
export interface ReferenceImage {
  id: string; profileId: string; photoId: string | null; externalPath: string;
  kind: 'REFERENCE' | 'BEFORE' | 'AFTER'; pairId: string | null;
  fingerprint: string; createdAt: string;
}
export type ReferenceImageInput = Omit<ReferenceImage, 'id' | 'createdAt'>;
export interface SceneSignals {
  exposure: number | null; sharpness: number | null;
  blur: 'CLEAR' | 'DOF_POSSIBLE' | 'POSSIBLE_BLUR' | 'UNCERTAIN' | null;
  faceCount: number | null; faceScore: number | null; overall: number | null;
  confidence: number | null; isPortraitLike: boolean | null;
  outdoorIndoor: 'OUTDOOR' | 'INDOOR' | null; temperatureK: number | null;
  skyPresence: number | null; greenPresence: number | null;
}
