import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
// Installer tests use arbitrary bytes, never a mock inference/model in resources/models.
// @ts-expect-error JavaScript installer has no declaration file.
import { install, httpsResponse } from '../scripts/models.mjs';

test('installer skips valid files, replaces corruption and never publishes failed downloads', async () => {
  await mkdir('.test-tmp', { recursive: true });
  const directory = await mkdtemp(path.resolve('.test-tmp/model-installer-'));
  const data = Buffer.from('installer integrity test data');
  const entry = { file: 'bytes.bin', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), url: 'https://example.invalid/test' };
  const target = path.join(directory, entry.file);
  const source = async () => ({ body: [data.subarray(0, 3), data.subarray(3)] });
  try {
    assert.equal(await install(entry, directory, source), true);
    assert.equal(await install(entry, directory, () => { throw new Error('must not download'); }), false);
    await writeFile(target, 'old invalid content');
    await assert.rejects(install(entry, directory, async () => ({ body: [Buffer.alloc(data.length)] })), /SHA-256/);
    assert.equal(await readFile(target, 'utf8'), 'old invalid content');
    await assert.rejects(install(entry, directory, async () => ({ body: [data.subarray(0, 3)] })), /SHA-256/);
    await assert.rejects(install(entry, directory, async () => ({ body: [Buffer.alloc(data.length + 1)] })), /maior/);
    async function* interrupted() { yield data.subarray(0, 3); throw new Error('connection interrupted'); }
    await assert.rejects(install(entry, directory, async () => ({ body: interrupted() })), /interrupted/);
    assert.deepEqual(await readdir(directory), ['bytes.bin']);
    assert.equal(await install(entry, directory, source), true);
    assert.deepEqual(await readFile(target), data);
    await assert.rejects(httpsResponse('http://example.invalid/test'), /HTTPS/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
