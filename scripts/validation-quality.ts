import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { exposure, regionalSharpness, sharpness } from '../src/ai/quality.ts';
interface Decoded { input: string; inputKind: string; originalWidth: number; originalHeight: number; width: number; height: number; grayscaleFile: string; decodeMs: number; decoder: string }
const inputs = JSON.parse((await readFile('docs/evidence/decoded-assets.json', 'utf8')).replace(/^\uFEFF/, '')) as Decoded[];
const results = [];
for (const input of inputs) {
  const pixels = await readFile(`docs/evidence/${input.grayscaleFile}`);
  if (pixels.length !== input.width * input.height) throw new Error('Invalid grayscale buffer.');
  const start = performance.now();
  const output = { sharpness: sharpness(pixels, input.width, input.height), regionalSharpness: regionalSharpness(pixels, input.width, input.height), exposure: exposure(pixels) };
  results.push({ ...input, ...output, metricsMs: performance.now() - start, algorithm: 'Production quality.ts functions; deterministic heuristics, not neural inference' });
}
await writeFile('docs/evidence/quality-real-assets.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
