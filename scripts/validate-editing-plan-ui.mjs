// Development-only Windows/Electron GUI validation of Editing Plan generation; isolated userData, no production bypass.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import electron from 'electron';
import { Store } from '../src/database/store.ts';
import { newStyleProfile, quantitativeAnswer } from '../src/editing/questionnaire.ts';
import { ANALYSIS_VERSION } from '../src/lib/config.ts';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir('.test-tmp', { recursive: true });
await mkdir('docs/evidence/editing-plan-ui', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/editing-plan-ui-'));
const evidence = { mode: 'actual Electron GUI automation, not human manual review', userData: root, checks: [], screenshots: [], errors: [] };
const seedDir = path.join(root, 'storage'); await mkdir(seedDir);
const original1 = path.join(root, 'p1.jpg'), original2 = path.join(root, 'p2.jpg');
await sharp({ create: { width: 300, height: 200, channels: 3, background: '#315e9f' } }).jpeg().toFile(original1);
await sharp({ create: { width: 240, height: 160, channels: 3, background: '#7aa05c' } }).jpeg().toFile(original2);
const preview1 = path.join(root, 'preview1.jpg'), thumb1 = path.join(root, 'thumb1.jpg');
const preview2 = path.join(root, 'preview2.jpg'), thumb2 = path.join(root, 'thumb2.jpg');
for (const [src, w, dst] of [[original1, 120, thumb1], [original1, 300, preview1], [original2, 120, thumb2], [original2, 240, preview2]]) await sharp(src).resize({ width: w }).jpeg().toFile(dst);
const p1Bytes = await readFile(original1), p2Bytes = await readFile(original2);
function makeAnalysis(exposure, confidence) {
  return { version: ANALYSIS_VERSION, sharpness: 62, regionalSharpness: 58, exposure, faceScore: null, eyesScore: null, aestheticScore: null, overall: 70, blur: 'CLEAR', confidence, faces: [], facesAvailable: false, embeddingAvailable: true, insight: 'Sinal de validação' };
}
let seed = new Store(path.join(seedDir, 'clickit.sqlite'));
const project = seed.create('Validação plano', root);
seed.index(project.id, { path: original1, name: 'p1.jpg', extension: '.jpg', size: 900, mtime: 1 });
seed.index(project.id, { path: original2, name: 'p2.jpg', extension: '.jpg', size: 800, mtime: 2 });
const photorows = seed.photos(project.id); const p1 = photorows.find(p => p.originalPath === original1), p2 = photorows.find(p => p.originalPath === original2);
if (!p1 || !p2) throw new Error('Fotos de seed ausentes');
seed.result(p1.id, { width: 300, height: 200, captureDate: '2026-01-01T12:00:00.000Z', thumbnailPath: thumb1, previewPath: preview1, metadata: { iso: 6400, camera: 'Teste' }, analysis: makeAnalysis(45, 0.85), embedding: null, hash: '1'.repeat(64) });
seed.result(p2.id, { width: 240, height: 160, captureDate: '2026-01-02T12:00:00.000Z', thumbnailPath: thumb2, previewPath: preview2, metadata: { iso: 100 }, analysis: makeAnalysis(85, 0.9), embedding: null, hash: '2'.repeat(64) });
seed.decide(p1.id, { status: 'SELECTED' }); seed.decide(p2.id, { status: 'REJECTED' });
seed.createEditingProfile(quantitativeAnswer(quantitativeAnswer(newStyleProfile('Editorial plano'), 'exposurePreference', 20), 'grainPreference', 12));
seed.close(); seed = null;
const psQuote = value => `'${value.replaceAll("'", "''")}'`;
let session;
async function launch(licensed, directory) {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const command = `if (!(Test-Path -LiteralPath ${psQuote(directory)})) { throw 'Missing parent' }; $p = Start-Process -FilePath ${psQuote(electron)} -ArgumentList @('.', '--remote-debugging-port=${port}', '--user-data-dir=${directory}') -PassThru; $p.Id`;
  const env = { ...process.env, CLICKIT_DEV_LICENSE: licensed ? '1' : '' }; delete env.ELECTRON_RUN_AS_NODE;
  const pid = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', `$ErrorActionPreference='Stop'; ${command}`], { encoding: 'utf8', env }).trim());
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Missing Electron PID');
  let ws;
  for (let i = 0; i < 120; i++) {
    try { const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()); const target = targets.find(t => t.type === 'page' && t.url === 'clickit://app/index.html'); if (target) { ws = new WebSocket(target.webSocketDebuggerUrl); break; } } catch { /* Startup is asynchronous. */ }
    await sleep(250);
  }
  if (!ws) { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Stop-Process -Id ${pid} -ErrorAction SilentlyContinue`]); throw new Error('Electron GUI did not start'); }
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.method === 'Runtime.exceptionThrown') evidence.errors.push(value.params.exceptionDetails.text);
    if (value.id) { const call = pending.get(value.id); pending.delete(value.id); if (call) { clearTimeout(call.timer); if (value.error) call.reject(new Error(JSON.stringify(value.error))); else call.resolve(value.result); } }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result?.value; };
  await send('Runtime.enable');
  return { pid, ws, send, evaluate };
}
async function wait(expression) { for (let i = 0; i < 100; i++) { if (await session.evaluate(expression)) return; await sleep(150); } throw new Error(`GUI timeout: ${expression}`); }
async function click(text) {
  await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)`);
  await session.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled).click()`); await sleep(150);
}
async function clickPlanScope(text) {
  await wait(`[...document.querySelectorAll('.plan-scope-kinds button')].some(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)`);
  await session.evaluate(`[...document.querySelectorAll('.plan-scope-kinds button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled).click()`); await sleep(200);
}
async function selectValue(selector, value) {
  await session.evaluate(`(() => { const s=document.querySelector(${JSON.stringify(selector)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(250);
}
async function capture(name, width, height = 900) {
  await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  const screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  const file = `docs/evidence/editing-plan-ui/${name}.png`; await writeFile(file, Buffer.from(screenshot.data, 'base64')); evidence.screenshots.push(file);
  assert.equal(await session.evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'No viewport horizontal overflow');
}
async function close() {
  if (!session) return; const s = session; session = null;
  try { await s.evaluate('window.close()'); } catch { /* Window may close before reply. */ }
  s.ws.close(); await sleep(750);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${s.pid} -ErrorAction SilentlyContinue; if($p){Stop-Process -Id ${s.pid}}; exit 0`]);
}
try {
  session = await launch(true, root); await click('Editar');
  await wait('[...document.querySelectorAll(".style-profile .button-row button")].some(b => b.textContent.trim() === "Planos")');
  await session.evaluate(`[...document.querySelectorAll(".style-profile .button-row button")].find(b => b.textContent.trim() === "Planos").click()`); await wait('!!document.querySelector(".plan-section")');
  await selectValue('.plan-section .plan-field select', project.id);
  await clickPlanScope('Esta foto');
  await wait(`[...document.querySelectorAll('.plan-scope-kinds button')].find(b => b.textContent.trim() === 'Esta foto').getAttribute('aria-pressed') === 'true'`);
  await selectValue('.plan-section .plan-field:nth-of-type(2) select', p1.id);
  await capture('plan-scope-photo', 1440);
  await click('Gerar plano de edição'); await wait('document.querySelectorAll(".plan-card").length===1');
  await wait('document.querySelector(".plan-badge")?.textContent.trim() === "Gerado"');
  const table = await session.evaluate('document.querySelector(".plan-card .plan-table")?.textContent ?? ""');
  assert.ok(table.includes('Como você prefere a luz geral')); assert.ok(table.includes('+20'));
  assert.ok(table.includes('+5')); assert.ok(table.includes('+3')); assert.ok(table.includes('-1'));
  const explanation = await session.evaluate('document.querySelector(".plan-card .plan-explanation")?.textContent ?? ""');
  assert.ok(explanation.includes('base +20')); assert.ok(explanation.includes('resultado +5')); assert.ok(explanation.includes('levemente'));
  assert.ok(explanation.includes('cena +5'));
  const advisories = await session.evaluate('document.querySelector(".plan-advisories")?.textContent ?? ""');
  assert.ok(advisories.includes('ISO 6400')); assert.ok(advisories.includes('Observação'));
  const missing = await session.evaluate('document.querySelector(".plan-missing")?.textContent ?? ""');
  assert.ok(missing.includes('temperatureK')); assert.ok(missing.includes('outdoorIndoor'));
  const photo1Name = await session.evaluate('document.querySelector(".plan-card-header h3")?.textContent ?? ""');
  assert.ok(photo1Name.includes('p1.jpg'));
  evidence.checks.push('GUI profile Planos → projeto → foto → plano GENERATED com valores/explicação/advisory/missing');
  await capture('plan-generated', 1440);
  await clickPlanScope('ClickIT Picks'); await click('Gerar plano de edição'); await wait('document.querySelectorAll(".plan-card").length===1');
  evidence.checks.push('GUI batch ClickIT Picks é idempotente: plano existente reutilizado');
  await clickPlanScope('Esta foto'); await selectValue('.plan-section .plan-field:nth-of-type(2) select', p2.id);
  await click('Gerar plano de edição'); await wait('document.querySelectorAll(".plan-card").length===2');
  const cards = await session.evaluate('[...document.querySelectorAll(".plan-card-header h3")].map(h => h.textContent ?? "")');
  assert.deepEqual(cards.sort(), ['p1.jpg', 'p2.jpg']);
  const p2Table = await session.evaluate('[...document.querySelectorAll(".plan-card")].find(c => c.querySelector("h3")?.textContent.includes("p2.jpg"))?.querySelector(".plan-table")?.textContent ?? ""');
  assert.ok(p2Table.includes('Como você prefere a luz geral')); assert.ok(p2Table.includes('+20')); assert.ok(!p2Table.includes('+5'));
  evidence.checks.push('GUI segunda foto com exposição saudável não recebe correção de cena');
  await capture('plan-two', 1440);
  assert.deepEqual(await readFile(original1), p1Bytes); assert.deepEqual(await readFile(original2), p2Bytes);
  evidence.checks.push('GUI originais byte-identical após geração de planos');
  await close(); session = await launch(true, root); await click('Editar');
  await session.evaluate(`[...document.querySelectorAll(".style-profile .button-row button")].find(b => b.textContent.trim() === "Planos").click()`); await wait('document.querySelectorAll(".plan-card").length===2');
  const reopened = await session.evaluate('[...document.querySelectorAll(".plan-card .plan-table")].map(t => t.textContent)');
  assert.equal(reopened.filter(t => t.includes('+20')).length, 2); assert.equal(reopened.filter(t => t.includes('+5')).length, 1);
  assert.ok(await session.evaluate('document.querySelectorAll(".plan-badge")[0]?.textContent.trim() === "Gerado"'));
  evidence.checks.push('GUI fechar/reabrir mantém planos persistidos (2 planos, valores corretos, status Gerado)');
  await capture('plan-persisted', 1440);
  assert.equal(evidence.errors.length, 0);
  evidence.status = 'PASS'; console.log(JSON.stringify(evidence, null, 2));
} catch (error) { evidence.status = 'FAIL'; evidence.failure = error.stack ?? String(error); console.error(error); process.exitCode = 1; }
finally { await close(); await writeFile('docs/evidence/editing-plan-ui/validation.json', JSON.stringify(evidence, null, 2)); try { await rm(root, { recursive: true, force: true }); } catch { /* Dev profile may still hold locked files; evidence already written. */ } }