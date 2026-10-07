// Validation-only observer. Imports the unchanged production worker after installing timing wrappers.
import { workerData, threadId } from 'node:worker_threads';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { Embedder } from '../src/ai/embedding.ts';
const record = row => appendFileSync(path.join(workerData.cache, `timings-${threadId}.jsonl`), JSON.stringify(row) + '\n');
const run = Embedder.prototype.run;
Embedder.prototype.run = async function (...args) {
  const start = performance.now();
  const result = await run.apply(this, args);
  record({ stage: 'dinov2', ms: performance.now() - start, inferenceMs: this.lastInferenceMs });
  return result;
};
const toFile = sharp.prototype.toFile;
sharp.prototype.toFile = async function (...args) {
  const start = performance.now();
  const result = await toFile.apply(this, args);
  if (String(args[0]).endsWith('-preview.jpg.partial')) record({ stage: 'preview', ms: performance.now() - start });
  return result;
};
await import('../src/workers/analysis.ts');
