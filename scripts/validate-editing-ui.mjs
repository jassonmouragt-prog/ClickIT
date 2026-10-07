// Development-only Windows/Electron GUI validation; isolated userData, no production bypass.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, unlink } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import electron from 'electron';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir('.test-tmp', { recursive: true });
await mkdir('docs/evidence/editing-ui', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/editing-ui-'));
const evidence = { mode: 'actual Electron GUI automation, not human manual review', userData: root, checks: [], screenshots: [], errors: [] };
const image = path.join(root, 'reference.png');
await sharp({ create: { width: 600, height: 400, channels: 3, background: '#315e9f' } }).png().toFile(image);
const original = await readFile(image);
let session;
const psQuote = value => `'${value.replaceAll("'", "''")}'`;
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
    if (value.id) { const call = pending.get(value.id); pending.delete(value.id); if (call) { clearTimeout(call.timer); value.error ? call.reject(new Error(JSON.stringify(value.error))) : call.resolve(value.result); } }
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
async function setInput(selector, value) {
  await session.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(150);
}
async function capture(name, width, height = 850) {
  await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  const screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
  const file = `docs/evidence/editing-ui/${name}.png`; await writeFile(file, Buffer.from(screenshot.data, 'base64')); evidence.screenshots.push(file);
  assert.equal(await session.evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'No viewport horizontal overflow');
}
async function close() {
  if (!session) return; const s = session; session = null;
  try { await s.evaluate('window.close()'); } catch { /* Window may close before reply. */ }
  s.ws.close(); await sleep(750);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${s.pid} -ErrorAction SilentlyContinue; if($p){Stop-Process -Id ${s.pid}}; exit 0`]);
}
async function nativeFile(title) {
  const command = `$shell = New-Object -ComObject WScript.Shell; $ok=$false; for($i=0;$i -lt 30;$i++){if($shell.AppActivate(${psQuote(title)})){$ok=$true;break};Start-Sleep -Milliseconds 200}; if(!$ok){throw 'Native file dialog not found'}; Start-Sleep -Milliseconds 300; $shell.SendKeys('%n'); Start-Sleep -Milliseconds 200; $shell.SendKeys('^a'); $shell.SendKeys(${psQuote(image)}); $shell.SendKeys('{ENTER}')`;
  execFileSync('powershell.exe', ['-NoProfile', '-Command', command]); await sleep(300);
}
try {
  session = await launch(true, root); await click('Editar'); await wait('!!document.querySelector(".editing-page .empty")');
  await capture('empty-desktop', 1440); await click('Criar perfil'); await setInput('#style-name', 'Editorial suave');
  await click('Continuar'); await setInput('#style-exposurePreference', '20'); await click('Continuar'); await setInput('#style-temperaturePreference', '20'); await click('Dessaturados');
  await capture('wizard-color-desktop', 1440); await capture('wizard-color-1000', 1000);
  await click('Continuar'); await setInput('#style-shadowsPreference', '40'); await click('Continuar'); await setInput('#style-grainPreference', '20');
  await click('Continuar'); await click('Editorial'); await click('Continuar');
  await wait('document.querySelector(".style-review").textContent.includes("editorial")'); await click('Salvar perfil'); await wait('!!document.querySelector(".style-profile")');
  let profiles = await session.evaluate('window.clickit.editingProfiles()'); const id = profiles[0].id;
  assert.equal(profiles[0].q.temperaturePreference, 20); assert.equal(profiles[0].c.overallMood, 'EDITORIAL'); evidence.checks.push('GUI create/questionnaire/review/save');
  await click('Editar perfil'); await click('2Luz e exposição'); await setInput('#style-exposurePreference', '40'); await click('7Revisão'); await click('Salvar perfil');
  await wait('(document.querySelector(".style-profile")?.textContent ?? "").includes("Versão 2")'); evidence.checks.push('GUI reopen/edit/profileVersion=2');
  await click('Duplicar'); await wait('document.querySelectorAll(".style-profile").length===2');
  profiles = await session.evaluate('window.clickit.editingProfiles()'); assert.equal(profiles[1].profileVersion, 1); assert.notEqual(profiles[1].id, id); evidence.checks.push('GUI duplicate');
  await click('Adicionar referência'); await nativeFile('Adicionar referência'); await wait('document.querySelectorAll(".style-reference").length===1');
  await wait('[...document.querySelectorAll(".style-reference-image img")].every(i=>i.complete&&i.naturalWidth>0)'); evidence.checks.push('GUI native dialog/reference/thumbnail');
  await click('Adicionar Antes/Depois'); await nativeFile('Selecionar foto Antes'); await nativeFile('Selecionar foto Depois'); await wait('document.querySelectorAll(".style-reference").length===3');
  const refs = await session.evaluate(`window.clickit.editingReferences(${JSON.stringify(id)})`); assert.equal(refs[1].pairId, refs[2].pairId); assert.ok(refs[1].pairId); evidence.checks.push('GUI native BEFORE/AFTER pair');
  assert.deepEqual(await readFile(image), original); await capture('profiles-references-desktop', 1440);
  await close(); session = await launch(true, root); await click('Editar'); await wait('document.querySelectorAll(".style-profile").length===2');
  const persisted = await session.evaluate('window.clickit.editingProfiles()'); assert.deepEqual(persisted, profiles);
  assert.equal((await session.evaluate(`window.clickit.editingReferences(${JSON.stringify(id)})`)).length, 3); evidence.checks.push('GUI app close/reopen persistent profiles and references');
  await unlink(image); await click('Referências'); await wait('document.querySelectorAll(".style-reference").length===3'); await wait('document.querySelector(".style-reference-image")?.textContent.includes("indisponível")'); evidence.checks.push('GUI missing reference');
  await click('Remover'); await wait('document.querySelectorAll(".style-reference").length===2'); evidence.checks.push('GUI reference remove');
  // Delete the duplicate only: first profile retains references and cannot be silently deleted.
  await session.evaluate('document.querySelectorAll(".style-profile")[1].querySelectorAll("button")[3].click()'); await click('Confirmar exclusão'); await wait('document.querySelectorAll(".style-profile").length===1'); evidence.checks.push('GUI delete confirmation');
  await close(); const unlicensed = path.join(root, 'unlicensed'); await mkdir(unlicensed); session = await launch(false, unlicensed);
  await wait('!!document.querySelector(".activation-screen")'); assert.equal(await session.evaluate('!!document.querySelector(".editing-page")'), false);
  for (const name of ['editingProfiles', 'editingProfile', 'createEditingProfile', 'updateEditingProfile', 'deleteEditingProfile', 'duplicateEditingProfile', 'editingReferences', 'addEditingReference', 'removeEditingReference']) {
    const result = await session.evaluate(`window.clickit[${JSON.stringify(name)}](${JSON.stringify(id)},'REFERENCE').then(()=>({blocked:false}),e=>({blocked:true,message:e.message}))`);
    assert.equal(result.blocked, true); assert.match(result.message, /licença|licen[cç]a|ativ/i);
  }
  const assetDenied = await session.evaluate(`fetch('clickit://reference/${refs[0].id}').then(r=>r.ok)`); assert.equal(assetDenied, false);
  evidence.checks.push('GUI activation gate/all nine editing IPCs and thumbnails blocked without license');
  evidence.status = 'PASS'; console.log(JSON.stringify(evidence, null, 2));
} catch (error) { evidence.status = 'FAIL'; evidence.failure = error.stack; console.error(error); process.exitCode = 1; }
finally { await close(); await writeFile('docs/evidence/editing-ui/validation.json', JSON.stringify(evidence, null, 2)); }
