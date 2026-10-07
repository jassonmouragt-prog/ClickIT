import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
// @ts-expect-error JavaScript preprocessing has no declaration file.
import { nimaPreprocessRaw, nimaSourceIndex, NIMA_INPUT_SIZE } from '../scripts/nima-preprocess.mjs';

const photo = 'Imagens Teste/Imagem do ChatGPT 6 de out. de 2026, 09_01_00-1.png';
const tensorFixture = 'tests/fixtures/nima-preprocess-reference.f32';
const metaFixture = 'tests/fixtures/nima-preprocess-reference-meta.json';

test('nimaSourceIndex matches PIL/Keras nearest floor((i+0.5)*src/224)', () => {
  assert.equal(nimaSourceIndex(0, 1086), Math.floor(0.5 * 1086 / 224));
  assert.equal(nimaSourceIndex(1, 1086), Math.floor(1.5 * 1086 / 224));
  assert.equal(nimaSourceIndex(223, 1448), Math.floor(223.5 * 1448 / 224));
  assert.equal(nimaSourceIndex(0, 10), 0);
  assert.equal(nimaSourceIndex(223, 10), 9);
});

test('JS preprocessing tensor matches Keras/PIL reference on a real photo', { skip: !existsSync(photo) || !existsSync(tensorFixture) ? 'Requires real photo and exported Keras reference fixture' : false }, async () => {
  const meta = JSON.parse(await readFile(metaFixture, 'utf8'));
  const reference = new Float32Array((await readFile(tensorFixture)).buffer);
  assert.equal(reference.length, NIMA_INPUT_SIZE * NIMA_INPUT_SIZE * 3);
  const { data, info } = await sharp(photo).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  const tensor = nimaPreprocessRaw(data, info.width, info.height);
  assert.equal(tensor.length, reference.length);
  let maxAbsDiff = 0;
  let absSum = 0;
  for (let i = 0; i < tensor.length; i++) {
    const delta = Math.abs((tensor[i] ?? 0) - (reference[i] ?? 0));
    if (delta > maxAbsDiff) maxAbsDiff = delta;
    absSum += delta;
  }
  const meanAbsDiff = absSum / tensor.length;
  console.log(`preprocess parity maxAbsDiff=${maxAbsDiff} meanAbsDiff=${meanAbsDiff}`);
  assert.ok(Number.isFinite(maxAbsDiff));
  assert.ok(maxAbsDiff <= 1e-6, `maxAbsDiff ${maxAbsDiff} excede 1e-6`);
  assert.ok(meanAbsDiff <= 1e-7, `meanAbsDiff ${meanAbsDiff} excede 1e-7`);
  assert.equal(meta.pilFormula, 'src = floor((dst + 0.5) * srcSize / 224)');
});
