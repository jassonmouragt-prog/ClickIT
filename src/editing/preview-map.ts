import type { EditingAdjustment, EditingPreviewAdjustment, EditingProfileQuantitative, ManualOverrides, SliderValue } from './types.ts';

// Fase D — mapeamento CENTRAL e documentado do espaco interno ClickIT (-100..+100)
// para parametros de render de preview. Este modulo e puro (sem sharp/node) para que
// o renderer possa importa-lo sem embutir codigo nativo.
//
// NAO ha equivalencia 1:1 com Lightroom/XMP. A conversao para XMP e da Fase E.

export const PREVIEW_ENGINE_VERSION = 1;
export const PREVIEW_MAX_WIDTH = 1280;   // nao renderizar full-resolution por movimento de slider
export const PREVIEW_JPEG_QUALITY = 85;

// Parametros com implementacao visual confiavel no preview atual.
export const PREVIEW_PARAMS = [
  'exposurePreference', 'contrastPreference', 'highlightsPreference', 'shadowsPreference',
  'whitesPreference', 'blacksPreference', 'saturationPreference', 'vibrancePreference',
  'clarityPreference', 'texturePreference', 'sharpeningPreference', 'grainPreference', 'vignettePreference',
] as const;
export type PreviewParam = (typeof PREVIEW_PARAMS)[number];

// Aprovados no schema mas SEM implementacao visual confiavel nesta fase:
// marcados UNSUPPORTED_PREVIEW e nunca simulados no preview.
export const UNSUPPORTED_PREVIEW_PARAMS = ['temperaturePreference', 'tintPreference'] as const;

// Constantes da transformacao interna -> render (ver src/editing/preview.ts para a formula).
export const PREVIEW_RENDER_MAP = {
  exposureStops: 0.75,      // +100 interno -> +0.75 stop (ganho 2^(v/100*0.75))
  contrastAmount: 0.75,     // +100 interno -> escala 1.75 em torno do pivo 0.5
  shadowsAmount: 0.30,      // deslocamento com peso (1-L)^2
  highlightsAmount: 0.30,   // deslocamento com peso L^3
  whitesAmount: 0.35,       // deslocamento com peso L^6
  blacksAmount: 0.25,       // deslocamento com peso (1-L)^6
  saturationFull: 1.0,      // -100 interno -> escala de croma 0 (escala de cinza)
  vibranceAmount: 1.0,      // peso (1 - croma) aplicado a escala de saturacao
  grainAmount: 0.12,        // desvio maximo absoluto (0..1) da granulacao
  vignetteAmount: 0.65,     // intensidade maxima nas bordas
  vignetteStart: 0.45,      // raio normalizado onde a vinheta comeca
  claritySigma: 20,         // raio maximo do unsharp de clareza
  textureSigma: 3,          // raio maximo do unsharp de textura
  sharpeningSigma: 2,       // raio maximo do unsharp de nitidez
} as const;

export function isPreviewParam(param: keyof EditingProfileQuantitative): param is PreviewParam {
  return (PREVIEW_PARAMS as readonly string[]).includes(param);
}

// effective = clamp(sugestao + override) — override e DELTA em relacao a sugestao.
export function effectiveValue(param: keyof EditingProfileQuantitative, suggested: SliderValue, override: SliderValue): number {
  const value = Math.round(suggested + override);
  return Math.max(param === 'grainPreference' ? 0 : -100, Math.min(100, value));
}

export interface EffectivePreview {
  applied: EditingPreviewAdjustment[];      // suportados com valor != 0 (renderizados)
  unsupported: EditingPreviewAdjustment[];  // nao suportados com valor != 0 (UNSUPPORTED_PREVIEW)
  values: Record<string, number>;           // somente suportados != 0 (entrada do motor)
}
export function effectiveAdjustments(finalAdjustment: EditingAdjustment[], overrides: ManualOverrides = {}): EffectivePreview {
  const base = new Map<string, number>();
  for (const adjustment of finalAdjustment) base.set(adjustment.param, adjustment.value);
  const applied: EditingPreviewAdjustment[] = [], unsupported: EditingPreviewAdjustment[] = [], values: Record<string, number> = {};
  for (const param of PREVIEW_PARAMS) {
    const value = effectiveValue(param, base.get(param) ?? 0, overrides[param] ?? 0);
    if (value === 0) continue;
    applied.push({ param, value }); values[param] = value;
  }
  const unsupportedKeys = new Set<string>([...Object.keys(overrides), ...base.keys()]);
  for (const param of UNSUPPORTED_PREVIEW_PARAMS) {
    if (!unsupportedKeys.has(param)) continue;
    const value = effectiveValue(param, base.get(param) ?? 0, overrides[param] ?? 0);
    if (value !== 0) unsupported.push({ param, value });
  }
  return { applied, unsupported, values };
}
