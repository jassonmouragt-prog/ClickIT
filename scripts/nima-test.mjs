import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { nimaPreprocessRaw, nimaDistributionStats } from './nima-preprocess.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const photos = [];
let selectionEvidence;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--photo' && args[i + 1]) photos.push(path.resolve(args[++i]));
  else if (args[i] === '--selection-evidence' && args[i + 1]) selectionEvidence = path.resolve(args[++i]);
  else throw new Error(`Argumento inválido: ${args[i]}`);
}
if (!photos.length) throw new Error('Use --photo "caminho" uma vez por imagem.');

const modelDir = path.join(root, 'resources', 'models');
const manifest = JSON.parse(await readFile(path.join(modelDir, 'manifest.json'), 'utf8'));
const model = manifest.models?.nimaAesthetic;
if (!model) throw new Error('NIMA ainda não foi convertido/verificado; aestheticScore permanece null.');
const modelPath = path.join(modelDir, model.file);
if (path.basename(model.file) !== model.file) throw new Error('Manifesto NIMA contém caminho de modelo inválido.');
const hash = createHash('sha256'); let bytes = 0;
for await (const chunk of createReadStream(modelPath)) { hash.update(chunk); bytes += chunk.length; }
if (hash.digest('hex') !== model.sha256 || bytes !== model.bytes) throw new Error('SHA-256/tamanho do NIMA ONNX não confere com o manifesto.');
const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
const input = session.inputNames[0];
const output = session.outputNames[0];
if (session.inputNames.length !== 1 || session.outputNames.length !== 1) throw new Error('Contrato NIMA ONNX inválido: esperado um input e um output.');
const timings = [];
for (const photo of photos) {
  const started = performance.now();
  const { data, info } = await sharp(photo).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width < 1 || info.height < 1 || info.channels !== 3) throw new Error(`Preprocessing RGB inesperado para ${photo}`);
  const tensorData = nimaPreprocessRaw(data, info.width, info.height);
  const result = await session.run({ [input]: new ort.Tensor('float32', tensorData, [1, 224, 224, 3]) });
  const distribution = Array.from(result[output].data, Number);
  if (distribution.length !== 10 || distribution.some(value => !Number.isFinite(value) || value < -1e-6)) throw new Error(`Distribuição NIMA inválida para ${photo}`);
  const total = distribution.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-4) throw new Error(`Saída NIMA não soma 1 em ${photo}: ${total}`);
  const stats = nimaDistributionStats(distribution);
  timings.push({ photo, sha256: await fileSha256(photo), technicalScore: await technicalFor(photo), nimaMean: stats.nimaMean, nimaStd: stats.nimaStd, aestheticScore: stats.aestheticScore, distribution, elapsedMs: performance.now() - started });
  console.log(`${path.basename(photo)} | technicalScore=${timings.at(-1).technicalScore ?? 'null'} | nimaMean=${stats.nimaMean.toFixed(6)} | nimaStd=${stats.nimaStd.toFixed(6)} | aestheticScore=${stats.aestheticScore.toFixed(4)} | ${timings.at(-1).elapsedMs.toFixed(2)} ms`);
}
const evidencePath = path.join(root, 'docs', 'evidence', `nima-test-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
await mkdir(path.dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), model: model.name, onnxSha256: model.sha256, preprocessing: model.input.preprocessing, preprocessingParity: 'PIL/Keras nearest floor((i+0.5)*src/224); see docs/evidence/nima-preprocess-parity.json', scores: timings }, null, 2)}\n`);
console.log(`Evidence: ${path.relative(root, evidencePath)}`);
await session.release();

async function fileSha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function technicalFor(photo) {
  if (!selectionEvidence) return null;
  const evidence = JSON.parse(await readFile(selectionEvidence, 'utf8'));
  const items = evidence.images ?? evidence.rows ?? [];
  const match = items.find(image =>
    (image.path && path.resolve(image.path) === photo) || image.fileName === path.basename(photo),
  );
  return match?.analysis?.overall ?? match?.technicalScore ?? null;
}
