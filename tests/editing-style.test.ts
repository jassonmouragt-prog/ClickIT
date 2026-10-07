import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/database/store.ts';
import { newStyleProfile, quantitativeAnswer, conceptualAnswer, styleSummary, STYLE_SLIDERS, STYLE_CONCEPTS } from '../src/editing/questionnaire.ts';
import { registerEditingHandlers } from '../src/editing/ipc.ts';
import type { EditingHandler } from '../src/editing/ipc.ts';
import { importReferences, referenceThumbnail, referenceView } from '../src/editing/references.ts';
import { requireWorkspaceLicense } from '../src/main/workspace-license.ts';
import type { LicenseView } from '../src/licensing/types.ts';
import type { EditingProfile } from '../src/editing/types.ts';

async function fixture() {
  await mkdir('.test-tmp', { recursive: true }); const root = await mkdtemp(path.resolve('.test-tmp/style-'));
  const image = path.join(root, 'reference.png'); await sharp({ create: { width: 24, height: 16, channels: 3, background: '#3863ab' } }).png().toFile(image);
  return { root, image };
}
function api(store: Store, choose: () => Promise<string[] | null> = async () => null, state: LicenseView['state'] = 'VALID') {
  const handlers = new Map<string, EditingHandler>();
  const license = { status: async (): Promise<LicenseView> => ({ state }) };
  registerEditingHandlers((channel, handler) => handlers.set(channel, async (...args: unknown[]) => { await requireWorkspaceLicense(license); return handler(...args); }), store, choose, projectId => store.photos(projectId));
  return { handlers, call: async (channel: string, ...args: unknown[]) => { const fn = handlers.get(channel); assert.ok(fn); return await fn(...args); } };
}
test('questionário cobre os 15 quantitativos e seis conceitos; respostas são determinísticas e limitadas', () => {
  assert.equal(STYLE_SLIDERS.length, 15); assert.equal(STYLE_CONCEPTS.length, 6);
  for (const spec of STYLE_SLIDERS) {
    for (const value of [spec.min, 0, 20, 60, 100]) {
      const a = quantitativeAnswer(newStyleProfile('Style'), spec.key, value);
      assert.equal(a.q[spec.key], value); assert.deepEqual(a, quantitativeAnswer(newStyleProfile('Style'), spec.key, value));
    }
    assert.throws(() => quantitativeAnswer(newStyleProfile(), spec.key, 101));
    assert.throws(() => quantitativeAnswer(newStyleProfile(), spec.key, spec.min - 1));
    assert.throws(() => quantitativeAnswer(newStyleProfile(), spec.key, 0.5));
  }
});
test('conceitos não derivam números nesta fase; resumo textual é reproduzível', () => {
  let p = newStyleProfile('Editorial'); p = quantitativeAnswer(p, 'temperaturePreference', 20); p = quantitativeAnswer(p, 'shadowsPreference', 60);
  const q = structuredClone(p.q); p = conceptualAnswer(p, 'overallMood', 'EDITORIAL'); p = conceptualAnswer(p, 'greensStyle', 'DESATURATED');
  assert.deepEqual(p.q, q); assert.deepEqual(styleSummary(p), styleSummary(structuredClone(p)));
  assert.ok(styleSummary(p).some(s => s.includes('Levemente · mais quente')));
  assert.ok(styleSummary(p).some(s => s.includes('editorial'))); assert.ok(styleSummary(p).some(s => s.includes('dessaturados')));
  assert.throws(() => conceptualAnswer(p, 'overallMood', 'INVALID'));
});
test('salvar respostas do wizard via IPC, reabrir e editar incrementa versão e preserva plano STALE', async () => {
  const f = await fixture(); let store = new Store(path.join(f.root, 'style.sqlite')); const service = api(store);
  let p = quantitativeAnswer(newStyleProfile('Editorial'), 'temperaturePreference', 20); p = conceptualAnswer(p, 'overallMood', 'EDITORIAL');
  const profile = await service.call('editing:profiles:create', p) as EditingProfile;
  const project = store.create('Beta', f.root); store.index(project.id, { path: f.image, name: 'reference.png', extension: '.png', size: 12, mtime: 1 });
  const photo = store.photos(project.id)[0]!; store.db.prepare("UPDATE photos SET analysisStatus='DONE', hash=? WHERE id=?").run('a'.repeat(64), photo.id);
  const plan = store.createEditingPlan(profile.id, photo.id);
  const changed = quantitativeAnswer(p, 'contrastPreference', 60);
  assert.equal((await service.call('editing:profiles:update', profile.id, changed) as EditingProfile).profileVersion, 2);
  assert.equal(store.getEditingPlan(plan.id).status, 'STALE'); assert.deepEqual(store.getEditingPlan(plan.id).baseStyle, []);
  store.close(); store = new Store(path.join(f.root, 'style.sqlite'));
  try { assert.equal(store.getEditingProfile(profile.id).q.contrastPreference, 60); assert.equal(store.getEditingPlan(plan.id).status, 'STALE'); }
  finally { store.close(); }
});
test('duplicar via IPC cria versão inicial e não copia referências; exclusão é explícita', async () => {
  const f = await fixture(), s = new Store(':memory:');
  try {
    const a = api(s, async () => [f.image]); const p = await a.call('editing:profiles:create', newStyleProfile('Filme')) as EditingProfile;
    await a.call('editing:references:add', p.id, 'REFERENCE');
    const copy = await a.call('editing:profiles:duplicate', p.id) as EditingProfile;
    assert.notEqual(copy.id, p.id); assert.equal(copy.name, 'Cópia de Filme'); assert.equal(copy.profileVersion, 1);
    assert.deepEqual(copy.q, p.q); assert.deepEqual(copy.c, p.c); assert.deepEqual(s.listReferenceImages(copy.id), []);
    await a.call('editing:profiles:delete', copy.id); assert.equal(s.listEditingProfiles().length, 1);
    await assert.rejects(() => a.call('editing:profiles:delete', p.id), /referências/);
  } finally { s.close(); }
});
test('referências add/remove, Antes/Depois pairId, thumbnail e arquivo ausente sem tocar original', async () => {
  const f = await fixture(), original = await readFile(f.image), s = new Store(':memory:');
  try {
    const p = s.createEditingProfile(newStyleProfile('Style'));
    const pair = await importReferences(s, p.id, 'PAIR', [f.image, f.image]);
    assert.equal(pair[0]?.kind, 'BEFORE'); assert.equal(pair[1]?.kind, 'AFTER');
    assert.ok(pair[0]?.pairId); assert.equal(pair[0]?.pairId, pair[1]?.pairId);
    assert.equal(pair[0]?.fingerprint.length, 64); assert.equal((await referenceView(pair[0]!)).available, true);
    assert.equal((await sharp(await referenceThumbnail(pair[0]!)).metadata()).format, 'jpeg');
    assert.deepEqual(await readFile(f.image), original); assert.deepEqual(s.listEditingPlans(), []);
    await unlink(f.image); assert.equal((await referenceView(pair[0]!)).available, false); assert.equal(s.getEditingProfile(p.id).profileVersion, 1);
    pair.forEach(r => s.removeReferenceImage(r.id)); assert.deepEqual(s.listReferenceImages(), []);
  } finally { s.close(); }
});
test('par cancelado/falho não deixa metade persistida', async () => {
  const f = await fixture(), s = new Store(':memory:');
  try {
    const p = s.createEditingProfile(newStyleProfile('Style'));
    await assert.rejects(() => importReferences(s, p.id, 'PAIR', [f.image, path.join(f.root, 'missing.png')]));
    assert.deepEqual(s.listReferenceImages(), []);
    assert.deepEqual(await api(s).call('editing:references:add', p.id, 'PAIR'), []);
  } finally { s.close(); }
});
test('todos os IPCs Editar bloqueiam sem licença; guard permite só estados licenciados', async () => {
  const s = new Store(':memory:');
  try {
    for (const state of ['UNACTIVATED', 'EXPIRED', 'REVOKED', 'GRACE_EXPIRED'] as const) {
      const a = api(s, async () => { throw new Error('Dialog não deve abrir'); }, state);
      assert.equal(a.handlers.size, 13);
      for (const channel of a.handlers.keys()) await assert.rejects(() => a.call(channel, 'invalid'), /Licença/);
    }
    for (const state of ['VALID', 'VALID_OFFLINE'] as const) await requireWorkspaceLicense({ status: async () => ({ state }) });
    assert.deepEqual(s.listEditingProfiles(), []);
  } finally { s.close(); }
});
test('IPC rejeita injeção de metadados/versões, IDs inválidos e valores fora de range', async () => {
  const s = new Store(':memory:');
  try {
    const a = api(s);
    await assert.rejects(() => a.call('editing:profiles:create', { ...newStyleProfile('Style'), profileVersion: 8 }), /não permitido/);
    await assert.rejects(() => a.call('editing:profiles:get', '../unsafe'));
    const input = newStyleProfile('Style'); input.q.temperaturePreference = 101;
    await assert.rejects(() => a.call('editing:profiles:create', input), /faixa/);
  } finally { s.close(); }
});
