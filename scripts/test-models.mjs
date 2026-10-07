import { mkdir, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import sharp from 'sharp';
import { Embedder, validateEmbedding } from '../src/ai/embedding.ts';
import { root, verifyModels } from './models.mjs';
import { faceProbe } from './face-probe.mjs';

const [a, b] = process.argv.slice(2);
if (!a || !b || process.argv.length !== 4) {
  console.error('Uso: npm run models:test -- "foto-A-com-rosto.jpg" "foto-B-diferente.jpg"'); process.exitCode = 2;
} else {
  let temporary;
  const embedder = new Embedder();
  try {
    for (const file of [a, b]) if (!(await stat(file)).isFile()) throw new Error(`Foto inválida: ${file}`);
    await verifyModels();
    await mkdir(path.join(root, '.test-tmp'), { recursive: true });
    temporary = await mkdtemp(path.join(root, '.test-tmp/model-inference-'));
    const modified = path.join(temporary, 'a-modified.jpg');
    await sharp(a).rotate().modulate({ brightness: 1.03, saturation: 0.98 }).jpeg({ quality: 92 }).toFile(modified);
    await embedder.load(path.join(root, 'resources/models/dinov2-small.onnx'));
    const timings = [], inferenceTimings = [];
    async function run(file) {
      const start = performance.now(), vector = await embedder.run(file);
      timings.push(performance.now() - start);
      inferenceTimings.push(embedder.lastInferenceMs);
      validateEmbedding(vector);
      return vector;
    }
    const first = await run(a), repeated = await run(a), variant = await run(modified), different = await run(b);
    const maxDifference = Math.max(...first.map((x, i) => Math.abs(x - repeated[i])));
    const cosine = (x, y) => x.reduce((sum, value, i) => sum + value * y[i], 0);
    const similar = cosine(first, variant), unrelated = cosine(first, different);
    const result = { photoA: path.resolve(a), photoB: path.resolve(b), dimensions: first.length, first8: first.slice(0, 8), allFinite: first.every(Number.isFinite), nonzero: first.some(x => x !== 0), maxRepeatedDifference: maxDifference, cpuInferenceMs: inferenceTimings, cpuPreprocessingAndInferenceMs: timings, similarityAModified: similar, similarityAB: unrelated, embedding: first };
    console.log(JSON.stringify(result, null, 2));
    if (maxDifference > 1e-6) throw new Error('Embedding inconsistente em chamadas repetidas.');
    if (!(similar > unrelated)) throw new Error('Similaridade A/modificada não superou A/B para estas fotos.');
    result.face = await faceProbe(path.resolve(a), true);
    await writeFile(path.join(root, 'docs/evidence/models-inference.json'), JSON.stringify(result, null, 2));
    console.log(`PASS: inferência real 384D, repetibilidade, similaridade; facesDetected=${result.face.facesDetected}, landmarks=${result.face.landmarkCounts}`);
  } catch (error) { console.error(`FAIL: ${error.stack ?? error}`); process.exitCode = 1; }
  finally { await embedder.close(); if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
