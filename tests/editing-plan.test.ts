import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Store } from '../src/database/store.ts';
import { ANALYSIS_VERSION } from '../src/lib/config.ts';
import { EDITING_ENGINE_VERSION } from '../src/editing/config.ts';
import { newStyleProfile, quantitativeAnswer } from '../src/editing/questionnaire.ts';
import { clampSlider, generateContent, sceneSignals } from '../src/editing/planner.ts';
import { inputFingerprint } from '../src/editing/contracts.ts';
import type { Analysis } from '../src/types/domain.ts';

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return { version: ANALYSIS_VERSION, sharpness: 60, regionalSharpness: 55, exposure: 45, faceScore: null, eyesScore: null, aestheticScore: null, overall: 70, blur: 'CLEAR', confidence: 0.65, faces: [], facesAvailable: false, embeddingAvailable: true, insight: 'Sinal de teste', ...overrides };
}
async function fixture() {
  await mkdir('.test-tmp', { recursive: true }); const root = await mkdtemp(path.resolve('.test-tmp/plan-'));
  const original = path.join(root, 'p1.jpg');
  await sharp({ create: { width: 60, height: 40, channels: 3, background: '#447' } }).jpeg().toFile(original);
  const store = new Store(path.join(root, 'plan.sqlite'));
  const project = store.create('Plan', root);
  store.index(project.id, { path: original, name: 'p1.jpg', extension: '.jpg', size: 140, mtime: 1 });
  const photo = store.photos(project.id)[0]!;
  store.db.prepare('UPDATE photos SET analysisStatus=\'DONE\',hash=?,width=?,height=? WHERE id=?').run('a'.repeat(64), 60, 40, photo.id);
  store.db.prepare('INSERT INTO photo_analysis VALUES(?,?,?)').run(photo.id, JSON.stringify(makeAnalysis()), ANALYSIS_VERSION);
  store.db.prepare('INSERT INTO photo_metadata VALUES(?,?)').run(photo.id, JSON.stringify({ iso: 6400, camera: 'Teste' }));
  const analyzed = store.photo(photo.id);
  const photoSignal = { analysis: analyzed.analysis, width: analyzed.width, height: analyzed.height, metadata: analyzed.metadata };
  return { root, original, project, photo, photoSignal, store, close: () => store.close() };
}
async function anotherPhoto(store: Store, projectId: string, hash: string, overrides: Partial<Analysis> = {}) {
  const file = path.join(path.dirname((await store.photos(projectId))[0]!.originalPath), `${hash.slice(0, 6)}.jpg`);
  await sharp({ create: { width: 30, height: 30, channels: 3, background: '#844' } }).jpeg().toFile(file);
  store.index(projectId, { path: file, name: path.basename(file), extension: '.jpg', size: 100, mtime: 2 });
  const photo = store.photos(projectId).find(p => p.originalPath === file);
  if (!photo) throw new Error('Foto auxiliar ausente');
  store.db.prepare('UPDATE photos SET analysisStatus=\'DONE\',hash=?,width=?,height=? WHERE id=?').run(hash, 30, 30, photo.id);
  store.db.prepare('INSERT INTO photo_analysis VALUES(?,?,?)').run(photo.id, JSON.stringify(makeAnalysis({ ...overrides, exposure: 80 })), ANALYSIS_VERSION);
  store.db.prepare('INSERT INTO photo_metadata VALUES(?,?)').run(photo.id, JSON.stringify({}));
  return photo;
}

test('perfil neutro gera baseStyle vazio; sem análise nenhum sinal de cena é inventado', async () => {
  const f = await fixture();
  try {
    const profile = newStyleProfile('Neutro'); profile.source = 'MANUAL'; const p = f.store.createEditingProfile(profile);
    const content = generateContent(p, { analysis: null, width: 60, height: 40, metadata: {} });
    assert.deepEqual(content.baseStyle, []);
    assert.deepEqual(content.sceneCorrection, []);
    assert.deepEqual(content.finalAdjustment, []);
    const signals = sceneSignals({ analysis: null, width: 60, height: 40, metadata: {} });
    for (const key of Object.keys(signals)) assert.equal(signals[key as keyof typeof signals], null);
    assert.equal(content.missingSignals.length, Object.keys(signals).length);
  } finally { f.close(); }
});
test('baseStyle mapeia q 1:1 na escala interna -100..+100 e mantém valores', async () => {
  const f = await fixture();
  try {
    const p = f.store.createEditingProfile(quantitativeAnswer(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20), 'grainPreference', 12));
    const content = generateContent(p, f.photoSignal);
    const exposure = content.baseStyle.find(a => a.param === 'exposurePreference');
    assert.ok(exposure); assert.equal(exposure.value, 20); assert.equal(exposure.reason, 'PROFILE_BASE');
    const grain = content.baseStyle.find(a => a.param === 'grainPreference'); assert.equal(grain?.value, 12);
    assert.equal(content.baseStyle.length, 2); assert.equal(content.sceneCorrection.length, 3);
  } finally { f.close(); }
});
test('exposição baixa com confiança alta gera correção documentada de sombras/pretos/altas luzes', async () => {
  const f = await fixture();
  try {
    const p = f.store.createEditingProfile(quantitativeAnswer(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20), 'grainPreference', 12));
    const content = generateContent(p, f.photoSignal);
    // exposure 45 => deficit 25 => shadows 5, blacks 3(round 2.5), highlights -1(round 1.25)
    const shadows = content.sceneCorrection.find(a => a.param === 'shadowsPreference');
    const blacks = content.sceneCorrection.find(a => a.param === 'blacksPreference');
    const highlights = content.sceneCorrection.find(a => a.param === 'highlightsPreference');
    assert.ok(shadows && shadows.value > 0 && shadows.reason === 'SCENE' && shadows.note); assert.ok(blacks && blacks.value > 0); assert.ok(highlights && highlights.value < 0);
    const exposureRow = content.explanation.find(e => e.param === 'shadowsPreference');
    assert.ok(exposureRow); assert.equal(exposureRow.base, 0); assert.equal(exposureRow.scene, shadows.value); assert.equal(exposureRow.final, shadows.value);
    assert.ok(content.explanation.every(e => e.note.includes('resultado')));
  } finally { f.close(); }
});
test('exposição saudável ou confiança baixa não invocam correção de cena', async () => {
  const f = await fixture();
  try {
    const p = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20));
    const healthy = generateContent(p, { ...f.photoSignal, analysis: makeAnalysis({ exposure: 90, confidence: 0.8 }) });
    assert.deepEqual(healthy.sceneCorrection, []);
    const lowConfidence = generateContent(p, { ...f.photoSignal, analysis: makeAnalysis({ exposure: 40, confidence: 0.3 }) });
    assert.deepEqual(lowConfidence.sceneCorrection, []);
    assert.ok(lowConfidence.sceneAdvisories.some(a => a.signal === 'exposure' && a.kind === 'ADVISORY'));
  } finally { f.close(); }
});
test('sharpness baixa gera advisory e nunca ajuste de nitidez; olhos fechados geram observação', async () => {
  const f = await fixture();
  try {
    const p = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'sharpeningPreference', 30));
    const blurred = generateContent(p, { ...f.photoSignal, analysis: makeAnalysis({ blur: 'UNCERTAIN', confidence: 0.3 }) });
    assert.deepEqual(blurred.sceneCorrection, []);
    assert.ok(blurred.sceneAdvisories.some(a => a.signal === 'sharpness' && a.kind === 'ADVISORY'));
    assert.equal(blurred.finalAdjustment.find(a => a.param === 'sharpeningPreference')?.value, 30);
    const closedEyes = makeAnalysis({ faces: [{ x: 0.4, y: 0.35, width: 0.25, height: 0.3, sharpness: 50, eyes: 'CLOSED', blinkLeft: 1, blinkRight: 1 }], facesAvailable: true, eyesScore: 20, exposure: 90 });
    const withFace = generateContent(p, { ...f.photoSignal, analysis: closedEyes });
    assert.deepEqual(withFace.sceneCorrection, []);
    assert.ok(withFace.sceneAdvisories.some(a => a.signal === 'faceScore' && a.kind === 'OBSERVATION'));
    assert.ok(withFace.sceneAdvisories.some(a => a.signal === 'isPortraitLike' && a.kind === 'OBSERVATION'));
  } finally { f.close(); }
});
test('sinais que o pipeline não mede permanecem null e com correção zero', async () => {
  const f = await fixture();
  try {
    const p = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'temperaturePreference', 30));
    const content = generateContent(p, { ...f.photoSignal, analysis: makeAnalysis({ exposure: 90 }) });
    for (const key of ['temperatureK', 'outdoorIndoor', 'skyPresence', 'greenPresence']) assert.ok(content.missingSignals.includes(key as never));
    assert.ok(content.finalAdjustment.every(a => a.param !== 'temperaturePreference' || a.value === 30));
    assert.equal(content.sceneCorrection.length, 0);
    assert.equal(content.baseStyle.find(a => a.param === 'temperaturePreference')?.value, 30);
  } finally { f.close(); }
});
test('finalAdjustment compõe base+cena com clamp -100..+100 e origem registrada', async () => {
  const f = await fixture();
  try {
    const base = quantitativeAnswer(newStyleProfile('Editorial'), 'shadowsPreference', 95);
    const p = f.store.createEditingProfile(base);
    const content = generateContent(p, f.photoSignal);
    const shadows = content.finalAdjustment.find(a => a.param === 'shadowsPreference')!;
    assert.equal(shadows.value, 100); assert.equal(content.explanation.find(e => e.param === 'shadowsPreference')?.final, 100);
    assert.ok(shadows.note.includes('base') && shadows.note.includes('cena') && shadows.note.includes('final'));
    const heavy = generateContent(p, { ...f.photoSignal, analysis: makeAnalysis({ exposure: 10 }) });
    const heavyShadows = heavy.finalAdjustment.find(a => a.param === 'shadowsPreference')!;
    assert.equal(heavyShadows.value, 100);
  } finally { f.close(); }
});
test('explicação e conteúdo técnico são determinísticos (idempotência)', async () => {
  const f = await fixture();
  try {
    const profile = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20));
    const first = generateContent(profile, f.photoSignal), second = generateContent(profile, f.photoSignal);
    assert.deepEqual(first, second);
    const row = first.explanation.find(e => e.param === 'shadowsPreference')!;
    assert.equal(row.base, 0); assert.equal(row.final, row.scene);
  } finally { f.close(); }
});
test('plano gerado persiste GENERATED com fingerprint recalculado; original fica intacto', async () => {
  const f = await fixture(); const before = await readFile(f.original);
  let store = f.store;
  try {
    const profile = store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20));
    const draft = store.createEditingPlan(profile.id, f.photo.id);
    const generated = store.generateEditingPlan(draft.id);
    assert.equal(generated.status, 'GENERATED'); assert.ok(generated.generatedAt); assert.ok(generated.finalAdjustment.length);
    assert.equal(generated.engineVersion, EDITING_ENGINE_VERSION);
    assert.equal(generated.inputFingerprint, inputFingerprint(profile, 'a'.repeat(64)));
    assert.equal(generated.sourceOriginalPath, f.original);
    assert.deepEqual(generated, store.getEditingPlan(generated.id));
    const snapshot = JSON.parse(JSON.stringify(generated));
    store.close(); store = new Store(path.join(f.root, 'plan.sqlite'));
    assert.deepEqual(store.getEditingPlan(generated.id), snapshot);
  } finally { store.close(); }
  assert.deepEqual(await readFile(f.original), before);
});
test('perfil alterado marca plano STALE e regeneração cria nova versão sem sobrescrever história', async () => {
  const f = await fixture();
  try {
    const profile = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20));
    const first = f.store.createEditingPlan(profile.id, f.photo.id);
    f.store.generateEditingPlan(first.id);
    const updated = f.store.updateEditingProfile(profile.id, quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 60));
    assert.equal(f.store.getEditingPlan(first.id).status, 'STALE');
    const regenerated = f.store.generateEditingPlan(first.id);
    assert.equal(regenerated.status, 'GENERATED');
    assert.equal(regenerated.profileVersion, 2); assert.equal(regenerated.engineVersion, EDITING_ENGINE_VERSION);
    assert.notEqual(regenerated.inputFingerprint, first.inputFingerprint);
    assert.deepEqual(regenerated.statusHistory.map(h => h.status), ['DRAFT', 'GENERATED', 'STALE', 'GENERATED']);
    assert.ok(updated.updatedAt);
    assert.throws(() => f.store.generateEditingPlan(regenerated.id), /não pode ser regenerado/);
  } finally { f.close(); }
});
test('batch gera planos por escopo PICKS/SELECTED e pulsa fotos sem análise em vez de falhar', async () => {
  const f = await fixture();
  try {
    const profile = f.store.createEditingProfile(quantitativeAnswer(newStyleProfile('Editorial'), 'exposurePreference', 20));
    const bPhoto = await anotherPhoto(f.store, f.project.id, 'b'.repeat(64));
    const cPhoto = await anotherPhoto(f.store, f.project.id, 'c'.repeat(64));
    const d = await anotherPhoto(f.store, f.project.id, 'd'.repeat(64));
    f.store.decide(f.photo.id, { status: 'SELECTED' }); f.store.decide(bPhoto.id, { status: 'AI_SELECTED' }); f.store.decide(cPhoto.id, { status: 'REJECTED' });
    f.store.db.prepare("UPDATE photos SET analysisStatus='PENDING' WHERE id=?").run(d.id);
    const picks = f.store.generateEditingPlans(profile.id, [f.photo.id, bPhoto.id, cPhoto.id, d.id]);
    assert.equal(picks.generated.length, 3);
    assert.deepEqual(picks.skipped.map(s => s.photoId), [d.id]);
    assert.ok(picks.skipped[0]!.reason.includes('análise'));
    assert.ok(picks.generated.every(g => g.status === 'GENERATED'));
    const selected = f.store.generateEditingPlans(profile.id, [f.photo.id]); assert.equal(selected.generated.length, 1);
    assert.deepEqual(selected.generated[0]!.id, picks.generated[0]!.id);
  } finally { f.close(); }
});
test('conceitos semânticos não viram ajustes numéricos nesta fase', async () => {
  const f = await fixture();
  try {
    const p = newStyleProfile('Editorial'); p.c.overallMood = 'EDITORIAL'; p.c.greensStyle = 'DESATURATED';
    const profile = f.store.createEditingProfile(p);
    const content = generateContent(profile, { ...f.photoSignal, analysis: makeAnalysis({ exposure: 90 }) });
    assert.deepEqual(content.baseStyle, []);
    assert.equal(content.finalAdjustment.length, 0);
  } finally { f.close(); }
});
test('clampSlider respeita fronteiras internas', () => {
  assert.equal(clampSlider(100), 100); assert.equal(clampSlider(-100), -100);
  assert.equal(clampSlider(140), 100); assert.equal(clampSlider(-140), -100); assert.equal(clampSlider(10.4), 10);
});