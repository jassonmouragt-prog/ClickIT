import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../src/database/store.ts';
import { EditingStore } from '../src/editing/store.ts';
import { EDITING_ENGINE_VERSION, EDITING_SCHEMA_VERSION } from '../src/editing/config.ts';
import { CONCEPTUAL_VALUES, QUANTITATIVE_KEYS, inputFingerprint, validateTransition } from '../src/editing/contracts.ts';
import type { EditingProfileInput, EditingProfileQuantitative, EditingProfileConceptual, EditingPlanStatus } from '../src/editing/types.ts';

mkdirSync('.test-tmp', { recursive: true });
const root = mkdtempSync(path.resolve('.test-tmp/editing-'));
const beta = execFileSync('git', ['show', 'clickit-beta-0.1.0:src/database/store.ts'], { encoding: 'utf8' });
const betaSchema = beta.match(/this\.db\.exec\(`([\s\S]*?)`\);/)?.[1];
assert.ok(betaSchema, 'Schema deve vir da tag Beta real');
function input(): EditingProfileInput {
  return { name: 'Natural', source: 'MANUAL', presetPath: null,
    q: Object.fromEntries(QUANTITATIVE_KEYS.map(k => [k, null])) as unknown as EditingProfileQuantitative,
    c: Object.fromEntries(Object.keys(CONCEPTUAL_VALUES).map(k => [k, null])) as unknown as EditingProfileConceptual };
}
function fixture() {
  const file = path.join(root, `${crypto.randomUUID()}.sqlite`), original = path.join(root, `${crypto.randomUUID()}.jpg`);
  writeFileSync(original, 'original bytes');
  const db = new DatabaseSync(file); db.exec(betaSchema!);
  db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run('project', 'Beta', root, '2026-01-01', '2026-01-01', 'READY');
  db.prepare("INSERT INTO photos(id,projectId,originalPath,fileName,extension,fileSize,mtime,hash,analysisStatus,thumbnailPath,previewPath) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('photo', 'project', original, 'original.jpg', '.jpg', 14, 1, 'a'.repeat(64), 'DONE', 'thumbnail', 'preview');
  db.prepare("INSERT INTO photo_decisions(photoId,createdAt,status,source,favorite,keep) VALUES(?,?,'SELECTED','USER',1,1)").run('photo', '2026-01-01');
  db.prepare('INSERT INTO photo_analysis VALUES(?,?,?)').run('photo', '{"exposure":90}', 'beta');
  const snapshot = ['projects', 'photos', 'photo_analysis', 'photo_decisions'].map(t => db.prepare(`SELECT * FROM ${t}`).all());
  db.close(); return { file, original, snapshot };
}
function withStore(fn: (s: Store) => void) { const s = new Store(':memory:'); try { fn(s); } finally { s.close(); } }
function withPlan(fn: (s: Store, id: string, profileId: string) => void) {
  const f = fixture(), s = new Store(f.file);
  try { const p = s.createEditingProfile(input()), plan = s.createEditingPlan(p.id, 'photo'); fn(s, plan.id, p.id); }
  finally { s.close(); }
}

test('abre Store Beta v1 e migra atomicamente sem alterar projetos/photos/análises/decisões/cache', () => {
  const f = fixture(), s = new Store(f.file);
  try {
    assert.equal(s.db.prepare('PRAGMA user_version').get()?.user_version, EDITING_SCHEMA_VERSION);
    assert.deepEqual(['projects', 'photos', 'photo_analysis', 'photo_decisions'].map(t => s.db.prepare(`SELECT * FROM ${t}`).all()), f.snapshot);
    assert.equal(s.photo('photo').decision, 'SELECTED'); assert.equal(s.photo('photo').favorite, true);
    assert.equal(readFileSync(f.original, 'utf8'), 'original bytes');
  } finally { s.close(); }
});
test('salvar v2 e reabrir mantém contratos de perfil/plano/referência', () => {
  const f = fixture(); let s = new Store(f.file);
  const p = s.createEditingProfile(input()), plan = s.createEditingPlan(p.id, 'photo');
  const r = s.addReferenceImage({ profileId: p.id, photoId: 'photo', externalPath: f.original, kind: 'REFERENCE', pairId: null, fingerprint: 'b'.repeat(64) });
  s.close(); s = new Store(f.file);
  try { assert.deepEqual(s.getEditingProfile(p.id), p); assert.deepEqual(s.getEditingPlan(plan.id), plan); assert.deepEqual(s.listReferenceImages(p.id), [r]); }
  finally { s.close(); }
});
test('reabrir v2 é idempotente e não duplica plano perfil/foto', () => {
  const f = fixture(); let s = new Store(f.file); const p = s.createEditingProfile(input()); s.createEditingPlan(p.id, 'photo'); s.close();
  s = new Store(f.file);
  try { assert.equal(s.listEditingPlans().length, 1); assert.throws(() => s.createEditingPlan(p.id, 'photo'), /UNIQUE/); }
  finally { s.close(); }
});
test('projeto antigo sem dados editing retorna vazio; ausência de tabelas também retorna vazio', () => {
  const f = fixture(), db = new DatabaseSync(f.file), legacy = new EditingStore(db);
  try { assert.deepEqual(legacy.listEditingProfiles(), []); assert.deepEqual(legacy.listEditingPlans(), []); assert.deepEqual(legacy.listReferenceImages(), []); }
  finally { db.close(); }
  const s = new Store(f.file);
  try { assert.deepEqual(s.listEditingPlans(), []); assert.equal(s.projects().length, 1); }
  finally { s.close(); }
});
test('perfil alterado avança versão, marca STALE e preserva histórico; nome/timestamp não alteram versão', () => withPlan((s, id, pid) => {
  const unchanged = s.updateEditingProfile(pid, { ...input(), name: 'Rename' }); assert.equal(unchanged.profileVersion, 1);
  assert.equal(s.getEditingPlan(id).status, 'DRAFT');
  const changed = input(); changed.q.contrastPreference = 10;
  assert.equal(s.updateEditingProfile(pid, changed).profileVersion, 2);
  assert.equal(s.getEditingPlan(id).status, 'STALE'); assert.equal(s.getEditingPlan(id).statusHistory.length, 2);
  assert.throws(() => s.deleteEditingProfile(pid), /planos/); assert.equal(s.listEditingPlans().length, 1);
}));
test('fingerprint determinístico ignora ordem/nome/caminhos/timestamps e muda com insumos relevantes', () => withPlan((s, id, pid) => {
  const p = s.getEditingProfile(pid), h = 'a'.repeat(64), fingerprint = inputFingerprint(p, h);
  const reordered = { ...p, name: 'Other', createdAt: 'other', updatedAt: 'other', presetPath: 'different', q: Object.fromEntries(Object.entries(p.q).reverse()) as unknown as EditingProfileQuantitative };
  assert.equal(inputFingerprint(reordered, h), fingerprint); assert.equal(s.getEditingPlan(id).inputFingerprint, fingerprint);
  assert.notEqual(inputFingerprint({ ...p, profileVersion: 2 }, h), fingerprint);
  assert.notEqual(inputFingerprint(p, h, EDITING_ENGINE_VERSION + 1), fingerprint);
  assert.notEqual(inputFingerprint(p, 'b'.repeat(64)), fingerprint);
  assert.notEqual(inputFingerprint({ ...p, q: { ...p.q, contrastPreference: 1 } }, h), fingerprint);
}));
test('range/enums/versões inválidos falham explicitamente', () => withStore(s => {
  for (const value of [-101, 101, NaN, 0.5]) { const p = input(); p.q.exposurePreference = value; assert.throws(() => s.createEditingProfile(p), /faixa/); }
  const p = input(); p.q.grainPreference = -1; assert.throws(() => s.createEditingProfile(p), /faixa/);
  assert.throws(() => s.createEditingProfile({ ...input(), c: { ...input().c, overallMood: 'INVALID' } } as unknown as EditingProfileInput), /inválido/);
  const profile = s.createEditingProfile(input()); assert.throws(() => inputFingerprint({ ...profile, profileVersion: 0 }, 'hash'), /Versão/);
  assert.throws(() => inputFingerprint(profile, 'hash', -1), /Versão/);
}));
test('lifecycle rejeita saltos e estados inválidos; fase A não simula geração/export', () => withPlan((s, id) => {
  validateTransition('DRAFT', 'GENERATED'); validateTransition('GENERATED', 'REVIEWED'); validateTransition('REVIEWED', 'EXPORTED');
  assert.throws(() => s.updateEditingPlanStatus(id, 'EXPORTED'), /Transição/);
  assert.throws(() => s.updateEditingPlanStatus(id, 'UNKNOWN' as EditingPlanStatus), /Transição/);
  assert.throws(() => s.updateEditingPlanStatus(id, 'GENERATED'), /gerado pelo motor/);
  assert.equal(s.updateEditingPlanStatus(id, 'STALE').status, 'STALE');
}));
test('engineVersion diferente e fingerprint adulterado são detectados na leitura', () => withPlan((s, id) => {
  const plan = s.getEditingPlan(id); plan.engineVersion++;
  s.db.prepare('UPDATE editing_plans SET data=? WHERE id=?').run(JSON.stringify(plan), id);
  assert.equal(s.getEditingPlan(id).status, 'STALE');
}));
test('photo hash/path alterados são STALE na leitura sem evento', () => withPlan((s, id) => {
  s.db.prepare('UPDATE photos SET hash=? WHERE id=?').run('c'.repeat(64), 'photo'); assert.equal(s.getEditingPlan(id).status, 'STALE');
}));
test('path original alterado é STALE mesmo mantendo o hash', () => withPlan((s, id) => {
  s.db.prepare('UPDATE photos SET originalPath=? WHERE id=?').run('moved.jpg', 'photo');
  assert.equal(s.getEditingPlan(id).status, 'STALE');
}));
test('perfil alterado sem evento é STALE via conteúdo normalizado', () => withPlan((s, id, pid) => {
  const p = s.getEditingProfile(pid); p.c.overallMood = 'FILM';
  s.db.prepare('UPDATE editing_profiles SET data=? WHERE id=?').run(JSON.stringify(p), pid);
  assert.equal(s.getEditingPlan(id).status, 'STALE');
}));
test('lifecycle preserva histórico e exige evidência para exportação', () => withPlan((s, id) => {
  // Fixture of a future generated plan; no generation code is executed.
  const p = s.getEditingPlan(id); p.generatedAt = p.createdAt;
  s.db.prepare('UPDATE editing_plans SET data=? WHERE id=?').run(JSON.stringify(p), id);
  assert.equal(s.updateEditingPlanStatus(id, 'GENERATED').status, 'GENERATED');
  assert.equal(s.updateEditingPlanStatus(id, 'REVIEWED').status, 'REVIEWED');
  assert.throws(() => s.updateEditingPlanStatus(id, 'EXPORTED'), /XMP/);
  assert.deepEqual(s.getEditingPlan(id).statusHistory.map(h => h.status), ['DRAFT', 'GENERATED', 'REVIEWED']);
}));
test('fingerprint diferente é STALE mesmo com versões iguais', () => withPlan((s, id) => {
  s.db.prepare('UPDATE editing_plans SET data=json_set(data,\'$.inputFingerprint\',?) WHERE id=?').run('invalid', id);
  assert.equal(s.getEditingPlan(id).status, 'STALE');
}));
test('reindex da origem marca STALE imediatamente preservando decisões humanas', () => withPlan((s, id) => {
  s.index('project', { path: s.photo('photo').originalPath, name: 'original.jpg', extension: '.jpg', size: 15, mtime: 2 });
  assert.equal(s.getEditingPlan(id).status, 'STALE'); assert.equal(s.photo('photo').decision, 'SELECTED');
}));
test('referências BEFORE/AFTER compartilham pairId, sem alterar original ou plano', () => withPlan((s, id, pid) => {
  const before = readFileSync(s.photo('photo').originalPath), plan = s.getEditingPlan(id);
  const refs = ['BEFORE', 'AFTER'].map(kind => s.addReferenceImage({ profileId: pid, photoId: null, externalPath: s.photo('photo').originalPath, kind: kind as 'BEFORE' | 'AFTER', pairId: 'pair', fingerprint: 'd'.repeat(64) }));
  assert.equal(s.listReferenceImages(pid).length, 2); assert.ok(refs.every(r => r.pairId === 'pair'));
  refs.forEach(r => s.removeReferenceImage(r.id)); assert.deepEqual(s.listReferenceImages(pid), []);
  assert.deepEqual(s.getEditingPlan(id), plan); assert.deepEqual(readFileSync(s.photo('photo').originalPath), before);
}));
test('FKs inexistentes e exclusões explícitas', () => withPlan((s, id, pid) => {
  assert.throws(() => s.createEditingPlan('missing', 'photo'), /inexistente/);
  assert.throws(() => s.createEditingPlan(pid, 'missing'), /inexistente/);
  assert.throws(() => s.addReferenceImage({ profileId: 'missing', photoId: null, externalPath: 'ref', kind: 'REFERENCE', pairId: null, fingerprint: 'a'.repeat(64) }), /inexistente/);
  s.deleteEditingPlan(id); s.deleteEditingProfile(pid); assert.deepEqual(s.listEditingProfiles(), []);
}));
test('migration falha com rollback de DDL e user_version', () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA user_version=1; CREATE TABLE editing_plans(id TEXT);');
  try { assert.throws(() => new EditingStore(db).migrateEditing()); assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 1); assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='editing_profiles'").get(), undefined); }
  finally { db.close(); }
});
