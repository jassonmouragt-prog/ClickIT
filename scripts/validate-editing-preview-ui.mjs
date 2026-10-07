// Development-only Windows/Electron GUI validation of the non-destructive Editing Preview (Phase D); isolated userData, no production bypass.
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
await mkdir('docs/evidence/editing-preview-ui', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/editing-preview-ui-'));
const evidence = { mode: 'actual Electron GUI automation, not human manual review', userData: root, checks: [], screenshots: [], errors: [] };
const seedDir = path.join(root, 'storage'); await mkdir(seedDir);
const original1 = path.join(root, 'p1.jpg');
await sharp({ create: { width: 300, height: 200, channels: 3, background: '#315e9f' } }).jpeg().toFile(original1);
const preview1 = path.join(root, 'preview1.jpg'), thumb1 = path.join(root, 'thumb1.jpg');
await sharp(original1).resize({ width: 120 }).jpeg().toFile(thumb1);
await sharp(original1).resize({ width: 300 }).jpeg().toFile(preview1);
const p1Bytes = await readFile(original1);
function makeAnalysis() {
  return { version: ANALYSIS_VERSION, sharpness: 62, regionalSharpness: 58, exposure: 45, faceScore: null, eyesScore: null, aestheticScore: null, overall: 70, blur: 'CLEAR', confidence: 0.85, faces: [], facesAvailable: false, embeddingAvailable: true, insight: 'Sinal de validação' };
}
let seed = new Store(path.join(seedDir, 'clickit.sqlite'));
const project = seed.create('Validação prévia', root);
seed.index(project.id, { path: original1, name: 'p1.jpg', extension: '.jpg', size: 900, mtime: 1 });
const p1 = seed.photos(project.id).find(p => p.originalPath === original1);
if (!p1) throw new Error('Foto de seed ausente');
seed.result(p1.id, { width: 300, height: 200, captureDate: '2026-01-01T12:00:00.000Z', thumbnailPath: thumb1, previewPath: preview1, metadata: { iso: 6400, camera: 'Teste' }, analysis: makeAnalysis(), embedding: null, hash: '1'.repeat(64) });
seed.createEditingProfile(quantitativeAnswer(quantitativeAnswer(quantitativeAnswer(newStyleProfile('Editorial prévia'), 'exposurePreference', 20), 'grainPreference', 12), 'temperaturePreference', 30));
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
async function selectValue(selector, value) {
  await session.evaluate(`(() => { const s=document.querySelector(${JSON.stringify(selector)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(250);
}
async function setRange(selector, value) {
  await session.evaluate(`(() => { const s=document.querySelector(${JSON.stringify(selector)}); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(s,${JSON.stringify(String(value))}); s.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(150);
}
async function showPreview() {
  await session.evaluate(`document.querySelector('.plan-preview')?.scrollIntoView({block:'center'})`); await sleep(300);
}
async function capture(name, width, height = 1100) {
  await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  const screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  const file = `docs/evidence/editing-preview-ui/${name}.png`; await writeFile(file, Buffer.from(screenshot.data, 'base64')); evidence.screenshots.push(file);
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
  await session.evaluate(`[...document.querySelectorAll('.plan-scope-kinds button')].find(b => b.textContent.trim() === 'Esta foto').click()`); await sleep(200);
  await selectValue('.plan-section .plan-field:nth-of-type(2) select', p1.id);
  await click('Gerar plano de edição'); await wait('document.querySelectorAll(".plan-card").length===1');
  await showPreview();
  await wait('!!document.querySelector(".plan-preview")');
  await wait('!!document.querySelector(\'.plan-preview-stage img[alt="Prévia da edição"]\') && document.querySelector(\'.plan-preview-stage img[alt="Prévia da edição"]\').naturalWidth > 0');
  const status = await session.evaluate('document.querySelector(".plan-preview-status")?.textContent ?? ""');
  assert.ok(status.includes('Prévia não destrutiva em'), status); assert.ok(status.includes('O arquivo original não é alterado'), status);
  assert.equal(await session.evaluate('document.querySelectorAll(".plan-preview-unsupported li").length'), 1);
  assert.ok((await session.evaluate('document.querySelector(".plan-preview-unsupported")?.textContent ?? ""')).includes('UNSUPPORTED_PREVIEW'));
  assert.equal(await session.evaluate('document.querySelector(".plan-preview-sliders output")?.textContent ?? ""'), '+20');
  const initialSrc = await session.evaluate('document.querySelector(\'.plan-preview-stage img[alt="Prévia da edição"]\').src');
  evidence.checks.push('GUI prévia renderiza sozinha em clickit://edited, com status não destrutivo e chip UNSUPPORTED_PREVIEW (temperature)');
  await capture('preview-rendered', 1440);
  await click('Antes');
  await wait('document.querySelector(".plan-preview-stage").dataset.mode === "before"');
  await click('Lado a lado');
  await wait('document.querySelector(".plan-preview-stage").dataset.mode === "side" && document.querySelectorAll(".plan-preview-stage figure").length === 2');
  await session.evaluate('document.querySelector(".plan-preview-hold").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
  await wait('document.querySelector(".plan-preview-stage").dataset.mode === "before"');
  await session.evaluate('document.querySelector(".plan-preview-hold").dispatchEvent(new PointerEvent("pointerup",{bubbles:true}))');
  await wait('document.querySelector(".plan-preview-stage").dataset.mode !== "before"');
  await click('Depois');
  await wait('document.querySelector(".plan-preview-stage").dataset.mode === "after"');
  evidence.checks.push('GUI comparação Antes/Depois/Lado a lado e segurar-para-ver-original trocam o modo da cena');
  await capture('preview-compare', 1440);
  await setRange('.plan-preview-sliders input[type=range]', 60);
  await wait('document.querySelector(".plan-preview-sliders output")?.textContent === "+60"');
  await wait('document.querySelector(".plan-preview-slider-foot small")?.textContent?.includes("sugestão +20")');
  await wait(`document.querySelector('.plan-preview-stage img[alt="Prévia da edição"]').src !== ${JSON.stringify(initialSrc)}`);
  evidence.checks.push('GUI slider manual aplica DELTA sobre a sugestão (+60 efetivo com chip sugestão +20) e re-renderiza');
  await setRange('.plan-preview-sliders input[type=range]', 20);
  await wait('document.querySelector(".plan-preview-sliders output")?.textContent === "+20"');
  await wait(`document.querySelector('.plan-preview-stage img[alt="Prévia da edição"]').src === ${JSON.stringify(initialSrc)}`);
  await wait('document.querySelector(".plan-preview-status")?.textContent?.includes("cache")');
  evidence.checks.push('GUI volta ao valor da sugestão e reusa o cache da mesma chave (src idêntico + "cache")');
  await setRange('.plan-preview-sliders input[type=range]', 60);
  await wait('document.querySelector(".plan-preview-slider-foot small")?.textContent?.includes("sugestão +20")');
  await click('Voltar à sugestão ClickIT');
  await wait('document.querySelector(".plan-preview-sliders output")?.textContent === "+20" && !document.querySelector(".plan-preview-slider-foot small")');
  await wait(`document.querySelector('.plan-preview-stage img[alt="Prévia da edição"]').src === ${JSON.stringify(initialSrc)}`);
  evidence.checks.push('GUI reset global "Voltar à sugestão ClickIT" limpa todos os ajustes manuais e re-renderiza');
  await capture('preview-reset', 1440);
  await click('Marcar como revisado');
  await wait('document.querySelector(".plan-badge")?.textContent.trim() === "Revisado"');
  await wait('document.querySelector(".plan-preview-reviewed")?.textContent?.includes("Revisado")');
  evidence.checks.push('GUI revisão marca GENERATED → REVIEWED com data, sem salto para Exportado');
  assert.deepEqual(await readFile(original1), p1Bytes);
  evidence.checks.push('GUI originais byte-identical após render, ajustes e revisão');
  await capture('preview-reviewed', 1440);
  assert.equal(evidence.errors.length, 0);
  await close();
  session = await launch(true, root); await click('Editar');
  await session.evaluate(`[...document.querySelectorAll(".style-profile .button-row button")].find(b => b.textContent.trim() === "Planos").click()`); await wait('document.querySelectorAll(".plan-card").length===1');
  await showPreview();
  await wait('document.querySelector(".plan-badge")?.textContent.trim() === "Revisado"');
  await wait('!!document.querySelector(\'.plan-preview-stage img[alt="Prévia da edição"]\') && document.querySelector(\'.plan-preview-stage img[alt="Prévia da edição"]\').naturalWidth > 0');
  await wait('document.querySelector(".plan-preview-status")?.textContent?.includes("cache")');
  evidence.checks.push('GUI fechar/reabrir mantém status Revisado e prévia servida do cache');
  await capture('preview-reopened', 1440);
  assert.equal(await readFile(original1).then(b => Buffer.compare(b, p1Bytes)), 0);
  evidence.checks.push('GUI original byte-idêntico após reabertura');
  assert.equal(evidence.errors.length, 0);
  evidence.status = 'PASS'; console.log(JSON.stringify(evidence, null, 2));
} catch (error) { evidence.status = 'FAIL'; evidence.failure = error.stack ?? String(error); console.error(error); process.exitCode = 1; }
finally { await close(); await writeFile('docs/evidence/editing-preview-ui/validation.json', JSON.stringify(evidence, null, 2)); try { await rm(root, { recursive: true, force: true }); } catch { /* Dev profile may still hold locked files; evidence already written. */ } }
