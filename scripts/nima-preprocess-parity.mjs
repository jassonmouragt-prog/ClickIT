// Compare JS/Sharp NIMA preprocessing against the Keras/PIL reference and
// verify ONNX Node distributions against Keras + ONNX-Python on the same photo.
// Usage: node scripts/nima-preprocess-parity.mjs [--photo path] [--out evidence.json]

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { nimaPreprocessRaw, nimaDistributionStats } from './nima-preprocess.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let photo = path.join(root, 'Imagens Teste', 'Imagem do ChatGPT 6 de out. de 2026, 09_01_00-1.png');
let outPath = path.join(root, 'docs', 'evidence', 'nima-preprocess-parity.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--photo' && args[i + 1]) photo = path.resolve(args[++i]);
  else if (args[i] === '--out' && args[i + 1]) outPath = path.resolve(args[++i]);
  else throw new Error(`Argumento inválido: ${args[i]}`);
}

const fixtureDir = path.join(root, 'tests', 'fixtures');
const metaPath = path.join(fixtureDir, 'nima-preprocess-reference-meta.json');
const tensorPath = path.join(fixtureDir, 'nima-preprocess-reference.f32');
const distributionsPath = path.join(fixtureDir, 'nima-preprocess-reference-distributions.json');

const meta = JSON.parse(await readFile(metaPath, 'utf8'));
const referenceTensor = new Float32Array((await readFile(tensorPath)).buffer);
const reference = JSON.parse(await readFile(distributionsPath, 'utf8'));

const photoSha = await fileSha256(photo);
if (photoSha !== meta.imageSha256) {
  throw new Error(`Imagem difere da referência de paridade: ${photoSha} != ${meta.imageSha256}`);
}

const { data, info } = await sharp(photo).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 3) throw new Error(`Esperado RGB8, recebido ${info.channels} canais`);
const jsTensor = nimaPreprocessRaw(data, info.width, info.height);
if (jsTensor.length !== referenceTensor.length) throw new Error('Tamanhos de tensor divergentes');

let tensorMaxAbs = 0;
let tensorAbsSum = 0;
for (let i = 0; i < jsTensor.length; i++) {
  const delta = Math.abs(jsTensor[i] - referenceTensor[i]);
  if (delta > tensorMaxAbs) tensorMaxAbs = delta;
  tensorAbsSum += delta;
}
const tensorMeanAbs = tensorAbsSum / jsTensor.length;

const modelManifest = JSON.parse(await readFile(path.join(root, 'resources', 'models', 'manifest.json'), 'utf8'));
const model = modelManifest.models?.nimaAesthetic;
if (!model) throw new Error('Manifesto NIMA ausente');
const modelPath = path.join(root, 'resources', 'models', model.file);
const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
const input = session.inputNames[0];
const output = session.outputNames[0];
const nodeResult = await session.run({ [input]: new ort.Tensor('float32', jsTensor, [1, 224, 224, 3]) });
const nodeDist = Array.from(nodeResult[output].data, Number);
await session.release();

const kerasDist = reference.keras;
const onnxPythonDist = reference.onnxPython;

function maxAbsDiff(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta > max) max = delta;
  }
  return max;
}

const diffs = {
  kerasVsOnnxPython: maxAbsDiff(kerasDist, onnxPythonDist),
  kerasVsOnnxNode: maxAbsDiff(kerasDist, nodeDist),
  onnxPythonVsOnnxNode: maxAbsDiff(onnxPythonDist, nodeDist),
};

const tolerance = { tensorMaxAbs: 1e-6, distributionMaxAbs: 1e-4 };
const pass = tensorMaxAbs <= tolerance.tensorMaxAbs
  && diffs.kerasVsOnnxPython <= tolerance.distributionMaxAbs
  && diffs.kerasVsOnnxNode <= tolerance.distributionMaxAbs
  && diffs.onnxPythonVsOnnxNode <= tolerance.distributionMaxAbs;

const payload = {
  generatedAt: new Date().toISOString(),
  status: pass ? 'PASS' : 'FAIL',
  photo,
  photoSha256: photoSha,
  sourceImageSize: { width: info.width, height: info.height },
  preprocessing: {
    formula: meta.pilFormula,
    resize: meta.resize,
    interpolation: meta.interpolation,
    colorMode: meta.colorMode,
    dtype: meta.dtype,
    scale: meta.preprocess,
  },
  tensorParity: {
    maxAbsDiff: tensorMaxAbs,
    meanAbsDiff: tensorMeanAbs,
    elements: jsTensor.length,
    tolerance: tolerance.tensorMaxAbs,
  },
  distributionParity: { ...diffs, tolerance: tolerance.distributionMaxAbs },
  distributions: { keras: kerasDist, onnxPython: onnxPythonDist, onnxNode: nodeDist },
  stats: {
    keras: nimaDistributionStats(kerasDist),
    onnxPython: nimaDistributionStats(onnxPythonDist),
    onnxNode: nimaDistributionStats(nodeDist),
  },
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`status=${payload.status}`);
console.log(`tensor maxAbsDiff=${tensorMaxAbs} meanAbsDiff=${tensorMeanAbs}`);
console.log(`keras/onnxPython maxAbsDiff=${diffs.kerasVsOnnxPython}`);
console.log(`keras/onnxNode maxAbsDiff=${diffs.kerasVsOnnxNode}`);
console.log(`onnxPython/onnxNode maxAbsDiff=${diffs.onnxPythonVsOnnxNode}`);
console.log(`Evidence: ${path.relative(root, outPath)}`);
if (!pass) process.exitCode = 1;

async function fileSha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
