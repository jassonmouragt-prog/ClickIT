import type { DecisionPatch, Settings } from '../types/domain.ts';
// Dependency-free validators are shared by the IPC boundary and native Node tests.
export function id(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) throw new Error('Identificador inválido.'); return value; }
export function name(value: unknown): string { if (typeof value !== 'string' || value.trim().length < 1 || value.length > 120) throw new Error('Nome deve ter entre 1 e 120 caracteres.'); return value.trim(); }
export function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dados inválidos.'); return value as Record<string, unknown>; }
export function decision(value: unknown): DecisionPatch {
  const v = record(value), keys = Object.keys(v);
  if (!keys.length || keys.some(k => !['status', 'rating', 'favorite', 'keep'].includes(k))) throw new Error('Decisão inválida.');
  if (v.status !== undefined && !['UNDECIDED', 'SELECTED', 'REVIEW', 'REJECTED'].includes(String(v.status))) throw new Error('Status inválido.');
  if (v.rating !== undefined && (!Number.isInteger(v.rating) || Number(v.rating) < 0 || Number(v.rating) > 5)) throw new Error('Estrelas inválidas.');
  for (const k of ['favorite', 'keep']) if (v[k] !== undefined && typeof v[k] !== 'boolean') throw new Error('Valor inválido.');
  return v as DecisionPatch;
}
export function settings(value: unknown): Settings {
  const v = record(value);
  if (!['AUTO', 'ECO', 'BALANCED', 'PERFORMANCE'].includes(String(v.mode)) || !Number.isInteger(v.concurrency) || Number(v.concurrency) < 1 || Number(v.concurrency) > 4) throw new Error('Configuração inválida.');
  return { mode: v.mode as Settings['mode'], concurrency: Number(v.concurrency) };
}
