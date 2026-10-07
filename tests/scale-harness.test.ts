import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
// @ts-expect-error Validation-only JavaScript module.
import { generate } from '../scripts/dataset-scale.mjs';
// @ts-expect-error Validation-only JavaScript module.
import { groupingMetrics, sha256 } from '../scripts/scale-common.mjs';

test('scale generator produces identical manifests/bytes across folders and keeps source intact', async () => {
  await mkdir('.test-tmp', { recursive: true });
  const directory = await mkdtemp(path.resolve('.test-tmp/scale-test-'));
  const source = path.join(directory, 'source'); await mkdir(source);
  // Spatially varying pixels expose transformations which a uniform image would hide.
  const pixels = Buffer.alloc(96 * 80 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17 + Math.floor(i / 29)) % 256;
  const original = path.join(source, 'base.png');
  await sharp(pixels, { raw: { width: 96, height: 80, channels: 3 } }).png().toFile(original);
  const originalHash = await sha256(original);
  const a = path.join(directory, 'a'), b = path.join(directory, 'b'), c = path.join(directory, 'c');
  const one = await generate({ source, output: a, count: 100, seed: 20261006 });
  const two = await generate({ source, output: b, count: 100, seed: 20261006 });
  assert.deepEqual(one, two);
  assert.equal(await sha256(path.join(a, 'dataset-scale-manifest.json')), await sha256(path.join(b, 'dataset-scale-manifest.json')));
  const transformations = new Set();
  for (const e of one.entries) {
    assert.equal(await sha256(path.join(a, e.file)), await sha256(path.join(b, e.file)));
    assert.equal(await sha256(path.join(a, e.file)), e.sha256);
    assert.ok((await sharp(path.join(a, e.file)).metadata()).width);
    if (e.transformation === 'exact-copy') assert.equal(e.sha256, originalHash);
    transformations.add(e.transformation);
  }
  assert.equal(transformations.size, 12);
  assert.equal(await sha256(original), originalHash);
  const changed = await generate({ source, output: c, count: 100, seed: 20261007 });
  assert.notDeepEqual(one.entries, changed.entries);
  await assert.rejects(generate({ source, output: a, count: 100 }), /vazio/);
  await assert.rejects(generate({ source, output: path.join(source, 'nested'), count: 100 }), /sobreposição/);
  await assert.rejects(generate({ source, output: b, count: 101 }), /count/);
  await assert.rejects(generate({ source, output: b, count: 100, seed: -1 }), /seed/);
});

test('grouping audit measures known merges/splits and distinguishes coverage from purity', () => {
  const entries = [{ file: 'a', trueGroup: 'A' }, { file: 'b', trueGroup: 'A' }, { file: 'c', trueGroup: 'B' }, { file: 'd', trueGroup: 'B' }];
  const photos = [{ id: '1', fileName: 'a', groupId: 'x' }, { id: '2', fileName: 'b', groupId: 'y' }, { id: '3', fileName: 'c', groupId: 'x' }, { id: '4', fileName: 'd', groupId: 'z' }];
  const result = groupingMetrics(entries, photos);
  assert.equal(result.purity, 0.75);
  assert.equal(result.fragmentation, 2);
  assert.equal(result.falseMerges, 1);
  assert.equal(result.falseSplits, 2);
  assert.equal(result.falseMergePairs, 1);
  assert.equal(result.falseSplitPairs, 2);
  assert.equal(groupingMetrics(entries, photos.map(p => ({ ...p, groupId: null }))).coverage, 0);
});

test('timing wrapper preserves production worker image/quality results', async () => {
  const directory = await mkdtemp(path.resolve('.test-tmp/scale-worker-'));
  const file = path.join(directory, 'photo.jpg');
  await sharp({ create: { width: 100, height: 80, channels: 3, background: '#b98877' } }).jpeg().toFile(file);
  async function run(workerFile: string, cache: string) {
    await mkdir(cache);
    const worker = new Worker(path.resolve(workerFile), { workerData: { cache, model: null } });
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        worker.once('error', reject);
        worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
        worker.postMessage({ id: 'validation', originalPath: file, fileSize: 1, mtime: 1, extension: '.jpg' });
      });
    } finally {
      await new Promise<void>(resolve => { worker.once('exit', () => resolve()); worker.postMessage('CLOSE'); });
    }
  }
  const original = await run('src/workers/analysis.ts', path.join(directory, 'original'));
  const measured = await run('scripts/scale-analysis-worker.mjs', path.join(directory, 'measured'));
  for (const key of ['previewPath', 'thumbnailPath']) {
    assert.deepEqual(await readFile(String(original[key])), await readFile(String(measured[key])));
    delete original[key]; delete measured[key];
  }
  assert.deepEqual(original, measured);
});
