import { createHash } from 'node:crypto';
import { ANALYSIS_VERSION } from '../lib/config.ts';
import { EDITING_ENGINE_VERSION } from './config.ts';
import type { EditingPlanStatus, EditingProfile, EditingProfileInput, ManualOverrides } from './types.ts';

export const QUANTITATIVE_KEYS = ['temperaturePreference', 'tintPreference', 'exposurePreference', 'contrastPreference', 'highlightsPreference', 'shadowsPreference', 'whitesPreference', 'blacksPreference', 'saturationPreference', 'vibrancePreference', 'clarityPreference', 'texturePreference', 'sharpeningPreference', 'grainPreference', 'vignettePreference'] as const;
export const CONCEPTUAL_VALUES = {
  skinToneStyle: ['NEUTRAL', 'WARM', 'COOL', 'NATURAL'], greensStyle: ['NATURAL', 'SOFT', 'DESATURATED', 'JUICY'],
  bluesStyle: ['NATURAL', 'MUTED', 'DEEP'], blackPointStyle: ['WASHED', 'NATURAL', 'DEEP'],
  highlightStyle: ['SOFT', 'NATURAL', 'BRIGHT'], overallMood: ['CLEAN', 'EDITORIAL', 'FILM', 'DRAMATIC', 'NATURAL'],
} as const;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Objeto de edição inválido.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} inválido.`);
}
export function version(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('Versão de edição inválida.');
}
export function validateProfile(value: unknown): asserts value is EditingProfileInput {
  const p = record(value); text(p.name, 'Nome');
  if (!['QUESTIONNAIRE', 'PRESET', 'MANUAL'].includes(String(p.source))) throw new Error('Origem de perfil inválida.');
  if (p.presetPath !== null) text(p.presetPath, 'Preset');
  const q = record(p.q), c = record(p.c);
  if (Object.keys(q).length !== QUANTITATIVE_KEYS.length || Object.keys(c).length !== Object.keys(CONCEPTUAL_VALUES).length) throw new Error('Campos de perfil inválidos.');
  for (const key of QUANTITATIVE_KEYS) {
    const v = q[key];
    if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < (key === 'grainPreference' ? 0 : -100) || v > 100)) throw new Error(`${key} fora da faixa interna.`);
  }
  for (const [key, allowed] of Object.entries(CONCEPTUAL_VALUES)) {
    if (c[key] !== null && (typeof c[key] !== 'string' || !(allowed as readonly string[]).includes(c[key]))) throw new Error(`${key} inválido.`);
  }
  if ('profileVersion' in p) version(p.profileVersion);
}
export function validateOverrides(value: unknown): ManualOverrides {
  const o = record(value); const clean: ManualOverrides = {};
  for (const key of Object.keys(o)) {
    if (!(QUANTITATIVE_KEYS as readonly string[]).includes(key)) throw new Error('Ajuste manual desconhecido.');
    const v = o[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < -100 || v > 100) throw new Error('Ajuste manual fora da faixa interna.');
    if (v !== 0) clean[key as keyof typeof clean] = v;
  }
  return clean;
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const r = record(value);
  return `{${Object.keys(r).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(r[k])}`).join(',')}}`;
}
export function profileContent(profile: EditingProfileInput): string {
  // Only semantic inputs. Identifiers, names, filesystem paths and timestamps are not editing inputs.
  return canonicalJson({ q: profile.q, c: profile.c });
}
export function inputFingerprint(profile: EditingProfile, photoHash: string, engineVersion = EDITING_ENGINE_VERSION): string {
  validateProfile(profile); version(profile.profileVersion); version(engineVersion); text(photoHash, 'Hash da origem');
  const profileHash = createHash('sha256').update(profileContent(profile)).digest('hex');
  return createHash('sha256').update([engineVersion, profile.profileVersion, profileHash, ANALYSIS_VERSION, photoHash].join('|')).digest('hex');
}
export const TRANSITIONS: Record<EditingPlanStatus, readonly EditingPlanStatus[]> = {
  DRAFT: ['GENERATED', 'STALE'], GENERATED: ['REVIEWED', 'STALE'],
  REVIEWED: ['EXPORTED', 'STALE'], EXPORTED: ['REVIEWED', 'STALE'], STALE: ['GENERATED'],
};
export function validateTransition(from: EditingPlanStatus, to: EditingPlanStatus): void {
  if (!Object.hasOwn(TRANSITIONS, to) || !TRANSITIONS[from]?.includes(to)) throw new Error(`Transição de plano inválida: ${from} → ${to}.`);
}
