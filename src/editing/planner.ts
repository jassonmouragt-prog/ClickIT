import type { Analysis, Metadata } from '../types/domain.ts';
import { QUANTITATIVE_KEYS } from './contracts.ts';
import { describeSlider } from './questionnaire.ts';
import type { EditingAdjustment, EditingExplanation, EditingProfile, EditingProfileQuantitative, SceneAdvisory, SceneSignalKey, SceneSignals, SliderValue } from './types.ts';

export const SCENE_RULES = {
  // Exposure is measured as the share (0-100) of pixels within the dynamic range.
  exposureAcceptableMin: 70,
  // Scene corrections only apply when the analysis confidence is high.
  sceneConfidenceMin: 0.6,
  exposureShadowsFactor: 0.2, exposureShadowsCap: 14,
  exposureBlacksFactor: 0.1, exposureBlacksCap: 7,
  exposureHighlightsFactor: 0.05, exposureHighlightsCap: 4,
  highIsoMinimum: 3200,
  portraitAreaMin: 0.06,
  portraitCenter: { min: 0.3, max: 0.7 },
} as const;
export const INTERNAL_MIN = -100, INTERNAL_MAX = 100;
export function clampSlider(value: number): SliderValue {
  return Math.max(INTERNAL_MIN, Math.min(INTERNAL_MAX, Math.round(value)));
}

export interface GeneratedContent {
  baseStyle: EditingAdjustment[];
  sceneCorrection: EditingAdjustment[];
  finalAdjustment: EditingAdjustment[];
  explanation: EditingExplanation[];
  sceneAdvisories: SceneAdvisory[];
  missingSignals: SceneSignalKey[];
}

interface ScenePhoto { analysis: Analysis | null; width: number; height: number; metadata: Metadata }
type AdjustmentParam = keyof EditingProfileQuantitative;

function portraitLike(faces: { x: number; y: number; width: number; height: number }[]): boolean {
  return faces.length === 1 && faces.every(f => {
    const area = f.width * f.height, cx = f.x + f.width / 2, cy = f.y + f.height / 2;
    return area >= SCENE_RULES.portraitAreaMin && cx >= SCENE_RULES.portraitCenter.min && cx <= SCENE_RULES.portraitCenter.max && cy >= SCENE_RULES.portraitCenter.min && cy <= SCENE_RULES.portraitCenter.max;
  });
}
export function sceneSignals(photo: ScenePhoto): SceneSignals {
  const a = photo.analysis;
  if (a === null) return { exposure: null, sharpness: null, blur: null, faceCount: null, faceScore: null, overall: null, confidence: null, isPortraitLike: null, outdoorIndoor: null, temperatureK: null, skyPresence: null, greenPresence: null };
  return {
    exposure: a.exposure, sharpness: a.sharpness, blur: a.blur,
    faceCount: a.facesAvailable ? a.faces.length : null,
    faceScore: a.faceScore, overall: a.overall, confidence: a.confidence,
    isPortraitLike: a.facesAvailable && a.faces.length > 0 ? portraitLike(a.faces) : null,
    // Signals not measured by the current analysis pipeline stay null and are never invented.
    outdoorIndoor: null, temperatureK: null, skyPresence: null, greenPresence: null,
  };
}
function sceneText(param: EditingAdjustment['param'], value: number): string {
  if (param === 'shadowsPreference') return value > 0 ? `com sombras abertas (+${value}) pela leitura de exposição da faixa` : `com sombras reiteradas (${value})`;
  if (param === 'blacksPreference') return value > 0 ? `com pretos levemente levantados (+${value}) pelo saldo de exposição` : `com pretos rebaixados (${value})`;
  if (param === 'highlightsPreference') return value < 0 ? `com altas luzes reduzidas (${value}) para proteger extremos claros` : `com altas luzes ressaltadas (+${value})`;
  return `${param} ${value >= 0 ? '+' : ''}${value}`;
}
function sceneNote(param: EditingAdjustment['param'], value: number): string {
  const exposureText = (p: EditingAdjustment['param'], v: number) => {
    if (p === 'shadowsPreference') return `Exposição média dentro da faixa de extremos; abertura conservadora de sombras (${v}).`;
    if (p === 'blacksPreference') return `Exposição média dentro da faixa de extremos; pretos levantados com moderação (${v}).`;
    if (p === 'highlightsPreference') return `Exposição média dentro da faixa de extremos; altas luzes reduzidas para proteger claros (${v}).`;
    return `Correção de cena ${v >= 0 ? '+' : ''}${v}.`;
  };
  return exposureText(param, value);
}
function baseAdjustments(profile: EditingProfile): EditingAdjustment[] {
  const result: EditingAdjustment[] = [];
  for (const key of QUANTITATIVE_KEYS) {
    const value = profile.q[key];
    if (value !== null) result.push({ param: key, value, reason: 'PROFILE_BASE', note: describeSlider(key, value) });
  }
  return result;
}
function sceneContent(photo: ScenePhoto): { adjustments: EditingAdjustment[]; advisories: SceneAdvisory[]; missing: SceneSignalKey[] } {
  const signals = sceneSignals(photo), adjustments: EditingAdjustment[] = [], advisories: SceneAdvisory[] = [], missing: SceneSignalKey[] = [];
  for (const key of Object.keys(signals) as SceneSignalKey[]) if (signals[key] === null) missing.push(key);
  const exposure = signals.exposure, confidence = signals.confidence;
  if (exposure !== null && confidence !== null && exposure < SCENE_RULES.exposureAcceptableMin) {
    if (confidence >= SCENE_RULES.sceneConfidenceMin) {
      const deficit = SCENE_RULES.exposureAcceptableMin - exposure;
      const shadows = Math.min(SCENE_RULES.exposureShadowsCap, Math.round(deficit * SCENE_RULES.exposureShadowsFactor));
      const blacks = Math.min(SCENE_RULES.exposureBlacksCap, Math.round(deficit * SCENE_RULES.exposureBlacksFactor));
      const highlights = -Math.min(SCENE_RULES.exposureHighlightsCap, Math.round(deficit * SCENE_RULES.exposureHighlightsFactor));
      if (shadows > 0) adjustments.push({ param: 'shadowsPreference', value: shadows, reason: 'SCENE', note: sceneNote('shadowsPreference', shadows) });
      if (blacks > 0) adjustments.push({ param: 'blacksPreference', value: blacks, reason: 'SCENE', note: sceneNote('blacksPreference', blacks) });
      if (highlights < 0) adjustments.push({ param: 'highlightsPreference', value: highlights, reason: 'SCENE', note: sceneNote('highlightsPreference', highlights) });
    } else {
      advisories.push({ kind: 'ADVISORY', signal: 'exposure', message: `Exposição na faixa de extremos (${Math.round(exposure)}) mas confiança do sinal baixa (${confidence.toFixed(2)}); nenhuma correção automática aplicada.` });
    }
  }
  if (signals.blur === 'UNCERTAIN' || signals.blur === 'POSSIBLE_BLUR') advisories.push({ kind: 'ADVISORY', signal: 'sharpness', message: `Nitidez baixa (blur ${signals.blur}); não é corrigida por edição — confira foco ou movimento na revisão 1:1.` });
  if (photo.analysis && signals.faceCount !== null && signals.faceCount >= 1) {
    const eyes = photo.analysis.eyesScore;
    if (eyes === 20) advisories.push({ kind: 'OBSERVATION', signal: 'faceScore', message: 'Olhos fechados detectados; não são editados automaticamente.' });
    else if (eyes === null) advisories.push({ kind: 'OBSERVATION', signal: 'faceScore', message: 'Estado dos olhos incerto; nada é alterado.' });
    if (signals.isPortraitLike === true) advisories.push({ kind: 'OBSERVATION', signal: 'isPortraitLike', message: 'Retrato com rosto grande/central; nenhum ajuste de pele é inventado.' });
  }
  if (photo.metadata.iso !== undefined && photo.metadata.iso >= SCENE_RULES.highIsoMinimum) advisories.push({ kind: 'OBSERVATION', signal: 'confidence', message: `ISO ${photo.metadata.iso} — possível ruído; a nitidez pretendida não é aumentada para compensar.` });
  return { adjustments, advisories, missing };
}
function explanationNote(param: AdjustmentParam, base: number, scene: number, final: number): string {
  const parts: string[] = [];
  if (base !== 0) parts.push(`perfil: ${describeSlider(param, base).toLocaleLowerCase('pt-BR')}`);
  if (scene !== 0) parts.push(`foto: ${sceneText(param, scene)}`);
  if (parts.length === 0) parts.push('sem alteração');
  return `${parts.join('; ')} — resultado ${final >= 0 ? '+' : ''}${final}.`;
}
export function generateContent(profile: EditingProfile, photo: ScenePhoto): GeneratedContent {
  const baseStyle = baseAdjustments(profile);
  const scene = sceneContent(photo);
  const merged = new Map<string, { base: number; scene: number }>();
  for (const a of baseStyle) merged.set(a.param, { base: a.value, scene: 0 });
  for (const a of scene.adjustments) {
    const current = merged.get(a.param) ?? { base: 0, scene: 0 };
    current.scene = a.value; merged.set(a.param, current);
  }
  const finalAdjustment: EditingAdjustment[] = [];
  const explanation: EditingExplanation[] = [];
  for (const [param, { base, scene }] of merged.entries()) {
    const final = clampSlider(base + scene);
    explanation.push({ param: param as AdjustmentParam, base, scene, final, note: explanationNote(param as AdjustmentParam, base, scene, final) });
    if (final !== 0) finalAdjustment.push({ param: param as AdjustmentParam, value: final, reason: base !== 0 ? 'PROFILE_BASE' : 'SCENE', note: `base ${base >= 0 ? '+' : ''}${base}; cena ${scene >= 0 ? '+' : ''}${scene}; final ${final >= 0 ? '+' : ''}${final}.` });
  }
  return { baseStyle, sceneCorrection: scene.adjustments, finalAdjustment, explanation, sceneAdvisories: scene.advisories, missingSignals: scene.missing };
}