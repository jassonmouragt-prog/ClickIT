import type { EditingProfileInput, EditingProfileQuantitative, EditingProfileConceptual } from './types.ts';

export const STYLE_STEPS = ['Nome e intenção', 'Luz e exposição', 'Cor', 'Contraste e tons', 'Textura', 'Estilo geral', 'Revisão'] as const;
type QuantitativeKey = keyof EditingProfileQuantitative;
export const STYLE_SLIDERS: { key: QuantitativeKey; step: number; label: string; low: string; high: string; min: number; neutral: string }[] = [
  { key: 'exposurePreference', step: 1, label: 'Como você prefere a luz geral?', low: 'Mais escura', high: 'Mais clara', min: -100, neutral: 'Luz natural' },
  { key: 'temperaturePreference', step: 2, label: 'Mais quente ou mais fria?', low: 'Mais fria', high: 'Mais quente', min: -100, neutral: 'Temperatura neutra' },
  { key: 'tintPreference', step: 2, label: 'Qual tendência de tonalidade?', low: 'Mais verde', high: 'Mais magenta', min: -100, neutral: 'Tonalidade neutra' },
  { key: 'saturationPreference', step: 2, label: 'Como você prefere as cores?', low: 'Discretas', high: 'Intensas', min: -100, neutral: 'Cores naturais' },
  { key: 'vibrancePreference', step: 2, label: 'Quanto de vibrância?', low: 'Baixa', high: 'Alta', min: -100, neutral: 'Vibrância média' },
  { key: 'contrastPreference', step: 3, label: 'Qual contraste combina com seu estilo?', low: 'Suave', high: 'Forte', min: -100, neutral: 'Contraste médio' },
  { key: 'shadowsPreference', step: 3, label: 'Como você prefere as sombras?', low: 'Densas', high: 'Abertas', min: -100, neutral: 'Sombras naturais' },
  { key: 'highlightsPreference', step: 3, label: 'E as altas luzes?', low: 'Suaves', high: 'Brilhantes', min: -100, neutral: 'Altas luzes naturais' },
  { key: 'whitesPreference', step: 3, label: 'Como você prefere os brancos?', low: 'Contidos', high: 'Luminosos', min: -100, neutral: 'Brancos naturais' },
  { key: 'blacksPreference', step: 3, label: 'Como você prefere os pretos?', low: 'Profundos', high: 'Lavados', min: -100, neutral: 'Pretos naturais' },
  { key: 'clarityPreference', step: 4, label: 'Contraste nos detalhes?', low: 'Suave', high: 'Marcado', min: -100, neutral: 'Clareza natural' },
  { key: 'texturePreference', step: 4, label: 'Mais textura ou aparência suave?', low: 'Suave', high: 'Mais textura', min: -100, neutral: 'Textura natural' },
  { key: 'sharpeningPreference', step: 4, label: 'Como você prefere a nitidez?', low: 'Suave', high: 'Mais nitidez', min: -100, neutral: 'Nitidez natural' },
  { key: 'grainPreference', step: 4, label: 'Você usa granulação?', low: 'Sem grão', high: 'Grão evidente', min: 0, neutral: 'Sem granulação' },
  { key: 'vignettePreference', step: 4, label: 'Você usa vinheta?', low: 'Bordas claras', high: 'Bordas escuras', min: -100, neutral: 'Sem vinheta' },
];
export const STYLE_CONCEPTS: { key: keyof EditingProfileConceptual; step: number; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'skinToneStyle', step: 2, label: 'Tons de pele', options: [{ value: 'NEUTRAL', label: 'Neutros' }, { value: 'WARM', label: 'Quentes' }, { value: 'COOL', label: 'Frios' }, { value: 'NATURAL', label: 'Naturais' }] },
  { key: 'greensStyle', step: 2, label: 'Verdes', options: [{ value: 'NATURAL', label: 'Naturais' }, { value: 'SOFT', label: 'Suavizados' }, { value: 'DESATURATED', label: 'Dessaturados' }, { value: 'JUICY', label: 'Intensos' }] },
  { key: 'bluesStyle', step: 2, label: 'Azuis', options: [{ value: 'NATURAL', label: 'Naturais' }, { value: 'MUTED', label: 'Suaves' }, { value: 'DEEP', label: 'Intensos' }] },
  { key: 'blackPointStyle', step: 3, label: 'Intenção para os pretos', options: [{ value: 'WASHED', label: 'Lavados' }, { value: 'NATURAL', label: 'Naturais' }, { value: 'DEEP', label: 'Profundos' }] },
  { key: 'highlightStyle', step: 3, label: 'Intenção para as altas luzes', options: [{ value: 'SOFT', label: 'Suaves' }, { value: 'NATURAL', label: 'Naturais' }, { value: 'BRIGHT', label: 'Brilhantes' }] },
  { key: 'overallMood', step: 5, label: 'Qual estética representa você?', options: [{ value: 'NATURAL', label: 'Natural' }, { value: 'CLEAN', label: 'Clean' }, { value: 'EDITORIAL', label: 'Editorial' }, { value: 'FILM', label: 'Filme' }, { value: 'DRAMATIC', label: 'Dramática' }] },
];
export function newStyleProfile(name = ''): EditingProfileInput {
  return { name, source: 'QUESTIONNAIRE', presetPath: null,
    q: { temperaturePreference: null, tintPreference: null, exposurePreference: null, contrastPreference: null, highlightsPreference: null, shadowsPreference: null, whitesPreference: null, blacksPreference: null, saturationPreference: null, vibrancePreference: null, clarityPreference: null, texturePreference: null, sharpeningPreference: null, grainPreference: null, vignettePreference: null },
    c: { skinToneStyle: null, greensStyle: null, bluesStyle: null, blackPointStyle: null, highlightStyle: null, overallMood: null } };
}
export function quantitativeAnswer(profile: EditingProfileInput, key: QuantitativeKey, value: number | null): EditingProfileInput {
  const spec = STYLE_SLIDERS.find(s => s.key === key);
  if (!spec || (value !== null && (!Number.isInteger(value) || value < spec.min || value > 100))) throw new Error('Resposta fora da faixa de estilo.');
  return { ...profile, q: { ...profile.q, [key]: value } };
}
export function conceptualAnswer(profile: EditingProfileInput, key: keyof EditingProfileConceptual, value: string | null): EditingProfileInput {
  const spec = STYLE_CONCEPTS.find(s => s.key === key);
  if (!spec || (value !== null && !spec.options.some(o => o.value === value))) throw new Error('Intenção de estilo inválida.');
  // Concepts remain semantic intentions; no derived numeric adjustments in Phase B.
  return { ...profile, c: { ...profile.c, [key]: value } };
}
export function describeSlider(key: QuantitativeKey, value: number | null): string {
  const s = STYLE_SLIDERS.find(s => s.key === key)!;
  if (value === null) return 'Sem preferência';
  if (value === 0) return s.neutral;
  const intensity = Math.abs(value) <= 30 ? 'Levemente' : Math.abs(value) <= 65 ? 'Moderadamente' : 'Fortemente';
  return `${intensity} · ${value < 0 ? s.low.toLocaleLowerCase('pt-BR') : s.high.toLocaleLowerCase('pt-BR')}`;
}
export function styleSummary(profile: EditingProfileInput): string[] {
  const lines: string[] = [];
  for (const spec of STYLE_SLIDERS) if (profile.q[spec.key] !== null) lines.push(`${spec.label.replace(/\?$/, '')}: ${describeSlider(spec.key, profile.q[spec.key])}`);
  for (const spec of STYLE_CONCEPTS) {
    const option = spec.options.find(o => o.value === profile.c[spec.key]);
    if (option) lines.push(`${spec.label}: ${option.label.toLocaleLowerCase('pt-BR')}`);
  }
  return lines.length ? lines : ['Estilo aberto: nenhuma preferência definida ainda.'];
}
