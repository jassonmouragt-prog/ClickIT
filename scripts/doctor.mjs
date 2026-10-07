import { spawn } from 'node:child_process';
import { access, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import { release } from 'node:os';
import { faceProbe } from './face-probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const rows = [];
const photos = [];
let reportFile;
for (let index = 2; index < process.argv.length; index++) {
  const option = process.argv[index];
  if ((option === '--photo' || option === '--json') && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    const value = path.resolve(process.argv[++index]);
    if (option === '--photo') photos.push(value); else reportFile = value;
  } else { console.error('Uso: npm run doctor -- [--photo "C:\\fotos\\foto.jpg"] [--json "docs/evidence/doctor.json"]'); process.exit(2); }
}
function report(status, item, detail, data) {
  rows.push({ status, item, detail, ...(data === undefined ? {} : { data }) });
  console.log(`${status.padEnd(4)} | ${item} | ${detail}`);
}
async function check(item, action) {
  try { const result = await action(); report('PASS', item, result.detail, result.data); }
  catch (error) { report('FAIL', item, error.message.split(/\r?\n/)[0], { stack: error.stack }); }
}
async function run(executable, args, timeout = 30000, extraEnv = {}) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd: root, windowsHide: true, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill(); finish({ code: null, stdout, stderr, error: `Tempo limite (${timeout / 1000}s)` }); }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => finish({ code: null, stdout, stderr, error: error.message }));
    child.on('close', code => finish({ code, stdout, stderr }));
  });
}
async function probe(mode, executable = process.execPath, args = [], extraEnv = {}, timeout = 60000) {
  const result = await run(executable, [path.join(root, 'scripts/doctor-probe.mjs'), mode, ...args], timeout, extraEnv);
  const line = result.stdout.split(/\r?\n/).filter(Boolean).at(-1);
  let parsed;
  try { parsed = JSON.parse(line ?? ''); } catch { /* Native crashes may produce no JSON; preserve stderr below. */ }
  if (result.code !== 0 || !parsed?.ok) throw new Error(parsed?.error || result.error || result.stderr || `Probe ${mode} não retornou resultado (exit ${result.code}).`);
  return parsed.data;
}
async function writable(directory) {
  await access(directory, constants.R_OK);
  const file = path.join(directory, `.clickit-doctor-${randomUUID()}.tmp`);
  const handle = await open(file, 'wx');
  try { await handle.writeFile('ClickIT doctor'); } finally { await handle.close(); }
  try { if (await readFile(file, 'utf8') !== 'ClickIT doctor') throw new Error('Leitura diverge da escrita.'); }
  finally { await unlink(file); }
  return { detail: `Leitura, escrita e exclusão verificadas: ${directory}` };
}

console.log('ClickIT doctor — diagnóstico local, sem downloads ou alterações em originais.');
const major = Number(process.versions.node.split('.')[0]);
report(major < 24 ? 'FAIL' : major === 24 ? 'PASS' : 'WARN', 'Node', `${process.version}; recomendado 24.21.0 x64 / linha 24 LTS`);
report(process.arch === 'x64' ? 'PASS' : 'FAIL', 'Arquitetura', `${process.arch}; alvo do projeto: x64`);
report(process.platform === 'win32' ? 'PASS' : 'WARN', 'Sistema operacional', `${process.platform} ${release()}; aceitação final requer Windows x64`);
if (process.env.ELECTRON_RUN_AS_NODE) report('WARN', 'Ambiente Electron', 'ELECTRON_RUN_AS_NODE está definido no terminal; remova antes de abrir a GUI.');

await check('Permissões do projeto', () => writable(root));
await check('Diretório temporário de diagnóstico', async () => { const folder = path.join(root, '.test-tmp'); await mkdir(folder, { recursive: true }); return writable(folder); });
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
await check('npm', async () => { const result = await run(process.execPath, [npmCli, '--version']); if (result.code !== 0) throw new Error(result.error ?? result.stderr); return { detail: result.stdout.trim() }; });
await check('Permissões do cache npm', async () => {
  const result = await run(process.execPath, [npmCli, 'config', 'get', 'cache']);
  if (result.code !== 0) throw new Error(result.error ?? result.stderr);
  return writable(result.stdout.trim());
});

for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
  await check(`Dependência ${name}`, async () => {
    const installed = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
    return { detail: `${installed.version} instalada; solicitada ${version}. Faixa verificada por npm ls abaixo.` };
  });
}
await check('Árvore de dependências', async () => {
  const result = await run(process.execPath, [npmCli, 'ls', '--depth=0', '--json']);
  const tree = JSON.parse(result.stdout || '{}');
  if (result.code !== 0) throw new Error((tree.problems ?? [result.error ?? result.stderr]).join('; '));
  return { detail: 'npm ls --depth=0 sem dependências diretas ausentes/inválidas.' };
});
try { await access(path.join(root, 'package-lock.json')); report('PASS', 'Lockfile', 'package-lock.json presente; use npm ci nas instalações subsequentes.'); }
catch { report('WARN', 'Lockfile', 'Ausente; gerar com npm install e preservar o resultado revisado.'); }

await check('Diretório dos modelos', async () => { const folder = path.join(root, 'resources/models'); if (!(await stat(folder)).isDirectory()) throw new Error('Não é um diretório.'); return writable(folder); });
for (const file of ['dinov2-small.onnx', 'face_landmarker.task']) {
  await check(`Modelo ${file}`, async () => { const target = path.join(root, 'resources/models', file); await access(target, constants.R_OK); const info = await stat(target); if (!info.isFile() || info.size < 1_000_000) throw new Error(`Modelo ausente/incompleto: ${target}`); return { detail: `${target} (${info.size} bytes); presença não prova inferência.` }; });
}
await check('Integridade dos modelos', async () => ({ detail: 'SHA-256 confere com o manifesto local.', data: await probe('model-hashes') }));
await check('SQLite', async () => ({ detail: 'Banco real escrito, fechado e reaberto.', data: await probe('sqlite') }));
await check('Sharp', async () => ({ detail: 'Logo PNG decodificada e redimensionada em memória.', data: await probe('sharp') }));
await check('ONNX Runtime API', async () => ({ detail: 'API JavaScript importada; ver carga nativa no próximo item.', data: await probe('onnx-runtime') }));
await check('Modelo ONNX / CPU', async () => ({ detail: 'Contrato real validado e inferência CPU executada pelo Embedder de produção; embedding finito, não nulo e normalizado.', data: await probe('onnx-model', process.execPath, photos.slice(0, 1)) }));
await check('MediaPipe / WASM', async () => ({ detail: 'Pacote resolvido, JS e cabeçalhos WASM verificados; não executa faces.', data: await probe('mediapipe') }));
if (!photos.length) report('WARN', 'MediaPipe / inferência', 'Use --photo para executar em renderer Electron real. Carregar recursos não comprova detecção.');

let electron;
await check('Electron disponível', async () => {
  electron = require('electron');
  if (typeof electron !== 'string') throw new Error('Pacote não retornou o caminho do executável.');
  await access(electron, constants.R_OK);
  return { detail: electron };
});
if (electron) await check('Módulos nativos dentro do Electron', async () => ({ detail: 'Electron executou SQLite, Sharp e inferência DINOv2 CPU em modo Node, fora do renderer.', data: await probe('electron-native', electron, photos.slice(0, 1), { ELECTRON_RUN_AS_NODE: '1' }, 90000) }));
else report('FAIL', 'Módulos nativos dentro do Electron', 'Executável Electron indisponível.');
report('WARN', 'Electron / interface', 'Janela, preload, IPC, logo e interação devem ser verificados via npm run dev.');

const photoResults = [];
for (const photo of photos) {
  await check(`Sharp / métricas ${path.basename(photo)}`, async () => {
    const result = await probe('photo-quality', process.execPath, [photo]);
    return { detail: `Sharp real: foco global=${result.focusGlobal}; regional=${result.focusRegional}; exposição=${result.exposure}`, data: result };
  });
  await check(`Foto real ${path.basename(photo)}`, async () => {
    const result = await probe('photo', process.execPath, [photo], {}, 180000);
    photoResults.push(result);
    console.log(`     input SHA-256=${result.inputSha256}; ${Math.round(result.elapsedMs)} ms; embedding=${result.embeddingDimensions}D; norma=${result.embeddingNorm.toFixed(6)}`);
    console.log(`     foco=${result.focusRegional}; exposição=${result.exposure}; embedding[0:8]=${JSON.stringify(result.embeddingFirst8)}`);
    return { detail: 'Worker de produção executou Sharp/ExifTool/ONNX; veja inferência facial separada.', data: result };
  });
  try {
    const result = await faceProbe(photo);
    console.log(`     facesDetected=${result.facesDetected}; landmarks=${JSON.stringify(result.landmarkCounts)}; CPU=${result.elapsedMs.toFixed(2)} ms`);
    report(result.facesDetected ? 'PASS' : 'WARN', `FaceLandmarker real ${path.basename(photo)}`, result.facesDetected ? 'Inferência real: rostos e landmarks presentes; classificação dos olhos NÃO validada.' : 'Inferência executada sem rostos detectados; não aprova detecção positiva.', result);
  } catch (error) { report('FAIL', `FaceLandmarker real ${path.basename(photo)}`, error.message, { stack: error.stack }); }
}
if (!photos.length) report('WARN', 'Inferência em foto real', 'Não executada; use --photo "C:\\Fotos\\teste.jpg" (pode repetir a opção).');
for (let i = 0; i < photoResults.length; i++) for (let j = i + 1; j < photoResults.length; j++) {
  const a = photoResults[i], b = photoResults[j];
  const similarity = a.embedding.reduce((sum, value, k) => sum + value * b.embedding[k], 0) / (a.embeddingNorm * b.embeddingNorm);
  report('PASS', `Cosseno ${path.basename(a.input)} / ${path.basename(b.input)}`, String(similarity), { similarity, note: 'Valor medido; não valida automaticamente semelhança ou limiar.' });
}
const counts = Object.fromEntries(['PASS', 'WARN', 'FAIL'].map(status => [status, rows.filter(row => row.status === status).length]));
console.log(`\nResumo: PASS ${counts.PASS} | WARN ${counts.WARN} | FAIL ${counts.FAIL}`);
console.log('PASS em um probe não aprova o MVP completo. WARN inclui etapas manuais não executadas.');
if (reportFile) {
  try { await writeFile(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), root, node: process.version, counts, rows }, null, 2)); console.log(`Relatório: ${reportFile}`); }
  catch (error) { console.error(`FAIL | Relatório JSON | ${error.message}`); process.exitCode = 1; }
}
if (counts.FAIL) process.exitCode = 1;
