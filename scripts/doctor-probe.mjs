import { mkdtemp, readFile, readdir, stat, unlink, rmdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { verifyModels } from './models.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const mode = process.argv[2];
const model = path.join(root, 'resources/models/dinov2-small.onnx');

async function sqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  const folder = await mkdtemp(path.join(root, '.test-tmp/doctor-sqlite-'));
  const file = path.join(folder, 'probe.sqlite');
  let database;
  try {
    database = new DatabaseSync(file);
    database.exec('CREATE TABLE probe(value TEXT NOT NULL); INSERT INTO probe VALUES (\'ClickIT\');');
    database.close(); database = new DatabaseSync(file);
    if (database.prepare('SELECT value FROM probe').get()?.value !== 'ClickIT') throw new Error('SQLite não persistiu o valor.');
    return { version: database.prepare('SELECT sqlite_version() version').get()?.version, persistence: true };
  } finally {
    database?.close();
    for (const suffix of ['', '-wal', '-shm']) await unlink(file + suffix).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(folder);
  }
}

async function sharpProbe() {
  const { default: sharp } = await import('sharp');
  // Existing official logo is decoded for real; never substitute a fabricated image.
  const input = path.join(root, 'public/logo.png');
  const output = await sharp(input).resize({ width: 64 }).png().toBuffer();
  const metadata = await sharp(output).metadata();
  if (metadata.width !== 64) throw new Error('Resultado Sharp inválido.');
  return { sharp: sharp.versions.sharp, vips: sharp.versions.vips, input, outputWidth: metadata.width, outputBytes: output.length };
}

async function onnxLoad() {
  const { Embedder, validateEmbedding, dinov2Contract } = await import('../src/ai/embedding.ts');
  const start = performance.now();
  const embedder = new Embedder();
  try {
    await embedder.load(model);
    const loadMs = performance.now() - start;
    const photo = path.resolve(process.argv[3] ?? path.join(root, 'FOTO A.png'));
    const embedding = await embedder.run(photo);
    return { ...embedder.metadata(), inputShape: dinov2Contract.input.shape, outputShape: embedder.lastOutputShape, loadMs, cpuInferenceMs: embedder.lastInferenceMs, photo, embedding: validateEmbedding(embedding), first8: embedding.slice(0, 8), inferenceExecuted: true, implementation: 'src/ai/embedding.ts (mesmo Embedder do worker de produção)', processType: process.versions.electron ? 'Electron ELECTRON_RUN_AS_NODE (fora do renderer)' : 'Node subprocess' };
  } finally { await embedder.close(); }
}

async function photoProbe(file) {
  const { validateEmbedding } = await import('../src/ai/embedding.ts');
  const originalPath = path.resolve(file);
  const details = await stat(originalPath);
  const extension = path.extname(originalPath).toLowerCase();
  if (!details.isFile() || !['.jpg', '.jpeg', '.png'].includes(extension)) throw new Error('--photo requer um arquivo JPEG/PNG real existente.');
  const cache = await mkdtemp(path.join(root, '.test-tmp/doctor-photo-'));
  const worker = new Worker(path.join(root, 'src/workers/analysis.ts'), { workerData: { cache, model } });
  const start = performance.now();
  try {
    const result = await new Promise((resolve, reject) => {
      worker.once('error', reject);
      worker.once('exit', code => reject(new Error(`Worker saiu antes do resultado: ${code}`)));
      worker.once('message', reply => reply.error ? reject(new Error(reply.error)) : resolve(reply.result));
      worker.postMessage({ id: 'doctor-photo', originalPath, fileName: path.basename(originalPath), extension, fileSize: details.size, mtime: details.mtimeMs });
    });
    if (!result || !Array.isArray(result.embedding)) throw new Error('Embedding real ausente.');
    const { norm } = validateEmbedding(result.embedding);
    const preview = await stat(result.previewPath), thumb = await stat(result.thumbnailPath);
    return { input: originalPath, inputSha256: result.hash, width: result.width, height: result.height, elapsedMs: performance.now() - start, preview: result.previewPath, previewBytes: preview.size, thumbnail: result.thumbnailPath, thumbnailBytes: thumb.size, focusGlobal: result.global, focusRegional: result.regional, exposure: result.light, embeddingDimensions: result.embedding.length, embeddingNorm: norm, embeddingFirst8: result.embedding.slice(0, 8), embedding: result.embedding, faceInferenceExecuted: false, implementation: 'src/workers/analysis.ts + src/ai/embedding.ts (produção, sem fixture)' };
  } finally {
    await new Promise(resolve => {
      const timer = setTimeout(() => { void worker.terminate().finally(resolve); }, 5000);
      worker.once('exit', () => { clearTimeout(timer); resolve(); });
      worker.postMessage('CLOSE');
    });
  }
}

async function photoQuality(file) {
  const { default: sharp } = await import('sharp');
  const { sharpness, regionalSharpness, exposure } = await import('../src/ai/quality.ts');
  const { LIMITS } = await import('../src/lib/config.ts');
  const input = path.resolve(file);
  const preview = await sharp(input).rotate().resize(LIMITS.preview, LIMITS.preview, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const { data, info } = await sharp(preview).resize(LIMITS.analysis, LIMITS.analysis, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { input, width: info.width, height: info.height, focusGlobal: sharpness(data, info.width, info.height), focusRegional: regionalSharpness(data, info.width, info.height), exposure: exposure(data), inferenceExecuted: false };
}

async function probe() {
  if (mode === 'sqlite') return sqlite();
  if (mode === 'sharp') return sharpProbe();
  if (mode === 'onnx-runtime') {
    const ort = await import('onnxruntime-node');
    if (typeof ort.InferenceSession?.create !== 'function' || typeof ort.Tensor !== 'function') throw new Error('API ONNX Runtime indisponível.');
    return { apiLoaded: true, nativeSessionVerified: false, note: 'DLL e modelo serão testados no probe onnx-model.' };
  }
  if (mode === 'onnx-model') return onnxLoad();
  if (mode === 'mediapipe') {
    const entry = require.resolve('@mediapipe/tasks-vision');
    const wasmDirectory = path.join(path.dirname(entry), 'wasm');
    const files = await readdir(wasmDirectory);
    const wasmFiles = files.filter(file => file.endsWith('.wasm'));
    if (!wasmFiles.length || !files.some(file => file.endsWith('.js'))) throw new Error('Runtime WASM/JS do MediaPipe incompleto.');
    for (const file of wasmFiles) {
      const data = await readFile(path.join(wasmDirectory, file));
      if (data.length < 8 || !data.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) throw new Error(`WASM inválido: ${file}`);
    }
    return { entry, wasmDirectory, wasmFiles, inferenceExecuted: false };
  }
  if (mode === 'model-hashes') {
    return { verified: await verifyModels(), note: 'SHA-256 e tamanho comparados ao catálogo fixado, incluindo validação do manifesto.' };
  }
  if (mode === 'electron-native') {
    if (!process.versions.electron) throw new Error('Probe não está rodando no Electron.');
    return { electron: process.versions.electron, node: process.version, sqlite: await sqlite(), sharp: await sharpProbe(), onnx: await onnxLoad(), guiTested: false };
  }
  if (mode === 'photo') return photoProbe(process.argv[3]);
  if (mode === 'photo-quality') return photoQuality(process.argv[3]);
  throw new Error(`Probe desconhecido: ${mode}`);
}

try { console.log(JSON.stringify({ ok: true, data: await probe() })); }
catch (error) { console.log(JSON.stringify({ ok: false, error: error.stack ?? String(error) })); process.exitCode = 1; }
