import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/database/store.ts';
import { ANALYSIS_VERSION } from '../src/lib/config.ts';
import { newStyleProfile, quantitativeAnswer } from '../src/editing/questionnaire.ts';
import { registerEditingHandlers } from '../src/editing/ipc.ts';
import type { EditingHandler } from '../src/editing/ipc.ts';
import { requireWorkspaceLicense } from '../src/main/workspace-license.ts';
import type { LicenseView } from '../src/licensing/types.ts';
import type { EditingAdjustment, EditingPlan, EditingPreviewResult } from '../src/editing/types.ts';
import type { Analysis } from '../src/types/domain.ts';
import { PREVIEW_PARAMS, PREVIEW_MAX_WIDTH, UNSUPPORTED_PREVIEW_PARAMS, effectiveAdjustments, effectiveValue, isPreviewParam } from '../src/editing/preview-map.ts';
import { PreviewCancelledError, previewFingerprint, previewUrl, renderEditingPreview } from '../src/editing/preview.ts';

function makeAnalysis(): Analysis {
  return { version: ANALYSIS_VERSION, sharpness: 60, regionalSharpness: 55, exposure: 45, faceScore: null, eyesScore: null, aestheticScore: null, overall: 70, blur: 'CLEAR', confidence: 0.65, faces: [], facesAvailable: false, embeddingAvailable: true, insight: 'Sinal de teste' };
}
async function baseImage(root: string, name: string, width: number, height: number): Promise<string> {
  const file = path.join(root, name);
  await sharp({ create: { width, height, channels: 3, background: '#4477aa' } }).jpeg().toFile(file);
  return file;
}
async function fixture() {
  await mkdir('.test-tmp', { recursive: true }); const root = await mkdtemp(path.resolve('.test-tmp/preview-'));
  const original = await baseImage(root, 'p1.jpg', 60, 40);
  const basePreview = await baseImage(root, 'p1.preview.jpg', 60, 40);
  const previewDir = await mkdtemp(path.resolve('.test-tmp/previewcache-'));
  const store = new Store(path.join(root, 'preview.sqlite'));
  const project = store.create('Preview', root);
  store.index(project.id, { path: original, name: 'p1.jpg', extension: '.jpg', size: 140, mtime: 1 });
  const photo = store.photos(project.id)[0]!;
  store.db.prepare('UPDATE photos SET analysisStatus=\'DONE\',hash=?,width=?,height=?,previewPath=? WHERE id=?').run('a'.repeat(64), 60, 40, basePreview, photo.id);
  store.db.prepare('INSERT INTO photo_analysis VALUES(?,?,?)').run(photo.id, JSON.stringify(makeAnalysis()), ANALYSIS_VERSION);
  store.db.prepare('INSERT INTO photo_metadata VALUES(?,?)').run(photo.id, JSON.stringify({ iso: 100 }));
  return { root, original, basePreview, previewDir, project, photo, store };
}
function api(store: Store, previewDir: string, state: LicenseView['state'] = 'VALID') {
  const handlers = new Map<string, EditingHandler>();
  const license = { status: async (): Promise<LicenseView> => ({ state }) };
  registerEditingHandlers((channel, handler) => handlers.set(channel, async (...args: unknown[]) => { await requireWorkspaceLicense(license); return handler(...args); }), store, async () => null, projectId => store.photos(projectId), previewDir);
  return { call: async (channel: string, ...args: unknown[]) => { const fn = handlers.get(channel); assert.ok(fn); return await fn(...args); } };
}
function makeProfile(store: Store, name: string, exposure?: number): string {
  const profile = exposure === undefined ? newStyleProfile(name) : quantitativeAnswer(newStyleProfile(name), 'exposurePreference', exposure);
  return store.createEditingProfile(profile).id;
}
const adjustment = (param: EditingAdjustment['param'], value: number): EditingAdjustment => ({ param, value, reason: 'PROFILE_BASE', note: 'teste' });

test('preview-map expõe exatamente os 13 params renderizáveis e temperature/tint como UNSUPPORTED_PREVIEW', () => {
  assert.equal(PREVIEW_PARAMS.length, 13);
  assert.deepEqual([...UNSUPPORTED_PREVIEW_PARAMS].sort(), ['temperaturePreference', 'tintPreference']);
  for (const param of PREVIEW_PARAMS) assert.ok(isPreviewParam(param), param);
  assert.equal(isPreviewParam('temperaturePreference'), false);
  assert.equal(PREVIEW_MAX_WIDTH, 1280);
});

test('override é DELTA sobre a sugestão e o efetivo é clamp(sugestão+override), com grão em 0..100', () => {
  assert.equal(effectiveValue('exposurePreference', 20, -5), 15);
  assert.equal(effectiveValue('exposurePreference', 90, 40), 100);
  assert.equal(effectiveValue('exposurePreference', -90, -40), -100);
  assert.equal(effectiveValue('grainPreference', 80, -200), 0);
  assert.equal(effectiveValue('grainPreference', 0, 100), 100);
});

test('effectiveAdjustments separa renderizados de UNSUPPORTED_PREVIEW e só alimenta o motor com suportados', () => {
  const final = [adjustment('exposurePreference', 20), adjustment('temperaturePreference', 12), adjustment('saturationPreference', 0)];
  const result = effectiveAdjustments(final, { exposurePreference: -5, tintPreference: 7 });
  const exposure = result.applied.find(a => a.param === 'exposurePreference');
  assert.equal(exposure?.value, 15);
  assert.equal(result.values.saturationPreference, undefined);
  assert.deepEqual(result.unsupported.map(a => a.param).sort(), ['temperaturePreference', 'tintPreference']);
  assert.equal(result.unsupported.find(a => a.param === 'temperaturePreference')?.value, 12);
  assert.equal(result.unsupported.find(a => a.param === 'tintPreference')?.value, 7);
  assert.equal(Object.keys(result.values).every(key => (PREVIEW_PARAMS as readonly string[]).includes(key)), true);
});

test('previewFingerprint é determinístico e muda com qualquer componente da chave', async () => {
  const f = await fixture();
  try {
    const input = { basePreviewPath: f.basePreview, photoHash: 'h1', inputFingerprint: 'fp1', values: { exposurePreference: 15 } };
    const a = await previewFingerprint(input); const b = await previewFingerprint({ ...input });
    assert.equal(a, b); assert.equal(a.length, 64); assert.match(previewUrl(a), /^clickit:\/\/edited\/[a-f0-9]{64}$/);
    assert.notEqual(await previewFingerprint({ ...input, photoHash: 'h2' }), a);
    assert.notEqual(await previewFingerprint({ ...input, inputFingerprint: 'fp2' }), a);
    assert.notEqual(await previewFingerprint({ ...input, values: { exposurePreference: 16 } }), a);
    await writeFile(f.basePreview, await sharp({ create: { width: 60, height: 40, channels: 3, background: '#123' } }).jpeg().toBuffer());
    assert.notEqual(await previewFingerprint({ ...input, values: { exposurePreference: 15 } }), a);
    await assert.rejects(previewFingerprint({ ...input, basePreviewPath: path.join(f.root, 'missing.jpg') }), /indisponível/);
  } finally { f.store.close(); }
});

test('render gera JPEG no cache próprio, não altera a prévia base nem cria arquivos junto do original', async () => {
  const f = await fixture();
  try {
    const before = await readFile(f.basePreview); const filesBefore = (await readdir(f.root)).sort();
    const input = { basePreviewPath: f.basePreview, photoHash: 'a'.repeat(64), inputFingerprint: 'fp', values: { exposurePreference: 15, vignettePreference: 40 }, cacheDir: f.previewDir };
    const outcome = await renderEditingPreview(input);
    assert.equal(outcome.cached, false); assert.equal(outcome.url, previewUrl(outcome.fingerprint));
    assert.ok(outcome.file.startsWith(f.previewDir));
    assert.deepEqual(await readFile(f.basePreview), before);
    assert.deepEqual((await readdir(f.root)).sort(), filesBefore);
    const meta = await sharp(outcome.file).metadata();
    assert.equal(meta.format, 'jpeg'); assert.ok((meta.width ?? 0) > 0);
  } finally { f.store.close(); }
});

test('cache: mesma chave servida sem re-render; override diferente gera outro arquivo', async () => {
  const f = await fixture();
  try {
    const base = { basePreviewPath: f.basePreview, photoHash: 'b'.repeat(64), inputFingerprint: 'fp', cacheDir: f.previewDir };
    const first = await renderEditingPreview({ ...base, values: { exposurePreference: 15 } });
    const again = await renderEditingPreview({ ...base, values: { exposurePreference: 15 } });
    assert.equal(again.cached, true); assert.equal(again.fingerprint, first.fingerprint);
    const other = await renderEditingPreview({ ...base, values: { exposurePreference: 16 } });
    assert.equal(other.cached, false); assert.notEqual(other.fingerprint, first.fingerprint);
    const files = (await readdir(f.previewDir)).filter(n => n.endsWith('.jpg'));
    assert.equal(files.length, 2);
  } finally { f.store.close(); }
});

test('cancelamento aborta o render com PreviewCancelledError e nada é gravado', async () => {
  const f = await fixture();
  try {
    await assert.rejects(renderEditingPreview({ basePreviewPath: f.basePreview, photoHash: 'c'.repeat(64), inputFingerprint: 'fp', values: { exposurePreference: 10 }, cacheDir: f.previewDir, shouldCancel: () => true }), PreviewCancelledError);
    assert.deepEqual(await readdir(f.previewDir), []);
  } finally { f.store.close(); }
});

test('render respeita a largura máxima do preview (nunca full-resolution)', async () => {
  const f = await fixture();
  try {
    const large = await baseImage(f.root, 'big.jpg', 2400, 1600);
    const outcome = await renderEditingPreview({ basePreviewPath: large, photoHash: 'd'.repeat(64), inputFingerprint: 'fp', values: { contrastPreference: 30 }, cacheDir: f.previewDir });
    const meta = await sharp(outcome.file).metadata();
    assert.ok((meta.width ?? 0) <= PREVIEW_MAX_WIDTH, `largura ${meta.width} > ${PREVIEW_MAX_WIDTH}`);
  } finally { f.store.close(); }
});

test('guard: DRAFT não renderiza; STALE recusa com a mensagem de plano desatualizado', async () => {
  const f = await fixture();
  try {
    const a = api(f.store, f.previewDir);
    const draft = f.store.createEditingPlan(makeProfile(f.store, 'Draft'), f.photo.id);
    await assert.rejects(a.call('editing:preview:render', draft.id), /não foi gerado/);
    const profileId = makeProfile(f.store, 'Gerado');
    const planId = f.store.generateEditingPlans(profileId, [f.photo.id]).generated[0]!.id;
    const rendered = await a.call('editing:preview:render', planId) as EditingPreviewResult;
    assert.equal(rendered.status, 'GENERATED');
    f.store.updateEditingProfile(profileId, quantitativeAnswer(newStyleProfile('Gerado'), 'grainPreference', 10));
    await assert.rejects(a.call('editing:preview:render', planId), /desatualizado/);
  } finally { f.store.close(); }
});

test('render via IPC devolve applied/unsupported/overrides e devolve a mesma chave em cache', async () => {
  const f = await fixture();
  try {
    const profileId = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Render'), 'exposurePreference', 20)).id;
    const planId = f.store.generateEditingPlans(profileId, [f.photo.id]).generated[0]!.id;
    const a = api(f.store, f.previewDir);
    const saved = await a.call('editing:overrides:save', planId, { exposurePreference: -5, temperaturePreference: 8 }) as { plan: EditingPlan };
    const plan = saved.plan;
    const final = plan.finalAdjustment.find(item => item.param === 'exposurePreference')?.value ?? 0;
    const first = await a.call('editing:preview:render', planId) as EditingPreviewResult;
    assert.equal(first.status, 'GENERATED'); assert.equal(first.cached, false);
    assert.equal(first.applied.find(item => item.param === 'exposurePreference')?.value, Math.max(-100, Math.min(100, final - 5)));
    assert.equal(first.unsupported.find(item => item.param === 'temperaturePreference')?.value, 8);
    assert.deepEqual(first.overrides, { exposurePreference: -5, temperaturePreference: 8 });
    assert.match(first.url, /^clickit:\/\/edited\/[a-f0-9]{64}$/);
    const second = await a.call('editing:preview:render', planId) as EditingPreviewResult;
    assert.equal(second.cached, true); assert.equal(second.fingerprint, first.fingerprint);
  } finally { f.store.close(); }
});

test('reset de override individual e global restaura a sugestão sem tocar o original', async () => {
  const f = await fixture();
  try {
    const profileId = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Reset'), 'exposurePreference', 20)).id;
    const planId = f.store.generateEditingPlans(profileId, [f.photo.id]).generated[0]!.id;
    const a = api(f.store, f.previewDir);
    const before = await readFile(f.original);
    await a.call('editing:overrides:save', planId, { exposurePreference: -5, grainPreference: 10 });
    const one = await a.call('editing:overrides:reset', planId, 'grainPreference') as { plan: EditingPlan };
    assert.deepEqual(one.plan.manualOverrides, { exposurePreference: -5 });
    const all = await a.call('editing:overrides:reset', planId) as { plan: EditingPlan };
    assert.deepEqual(all.plan.manualOverrides, {});
    assert.deepEqual(await readFile(f.original), before);
  } finally { f.store.close(); }
});

test('revisar marca REVIEWED com data e nunca altera o arquivo original; sem salto de estado', async () => {
  const f = await fixture();
  try {
    const profileId = f.store.createEditingProfile(newStyleProfile('Revisao')).id;
    const planId = f.store.generateEditingPlans(profileId, [f.photo.id]).generated[0]!.id;
    const a = api(f.store, f.previewDir);
    const before = await readFile(f.original);
    const reviewed = await a.call('editing:plans:review', planId) as { plan: EditingPlan };
    assert.equal(reviewed.plan.status, 'REVIEWED');
    assert.ok(reviewed.plan.reviewedAt);
    assert.notEqual(reviewed.plan.status, 'EXPORTED');
    await assert.rejects(a.call('editing:plans:review', planId), /inválid|estado/);
    assert.deepEqual(await readFile(f.original), before);
    const preview = await a.call('editing:preview:render', planId) as EditingPreviewResult;
    assert.equal(preview.status, 'REVIEWED');
  } finally { f.store.close(); }
});
