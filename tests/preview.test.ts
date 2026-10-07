import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, stat, unlink, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { build } from 'esbuild';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import type { Progress } from '../src/types/domain.ts';

test('import generates real PNG/JPEG previews before analysis, persists, resumes and isolates corrupt input', async () => {
  await mkdir('.test-tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.test-tmp/preview-'));
  const input = path.join(root, 'originais com espaços'); await mkdir(input);
  await build({ entryPoints: ['src/workers/preview.ts'], outfile: path.join(root, 'preview.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  for (const extension of ['png', 'jpg', 'jpeg']) {
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3b82f6' } }).toFile(path.join(input, 'fotografia.' + extension));
  }
  await writeFile(path.join(input, 'corrupt.png'), 'not a PNG');
  const store = new Store(path.join(root, 'test.sqlite'));
  try {
    const project = store.create('Preview regression', input);
    const events: { event: string; details: Record<string, string | number> }[] = [], progress: Progress[] = [];
    const options = { store, workerFile: path.join(root, 'analysis.cjs'), groupingFile: '', cache: path.join(root, 'cache'), model: null, faces: null, concurrency: 2, emit: (p: Progress) => progress.push(p), log: (event: string, details: Record<string, string | number>) => events.push({ event, details }) };
    await new Pipeline(options).index(project.id);
    const photos = store.photos(project.id), valid = photos.filter(p => p.fileName !== 'corrupt.png');
    assert.equal(valid.length, 3);
    for (const photo of valid) {
      assert.equal(photo.analysisStatus, 'PENDING'); assert.equal(photo.analysis, null);
      assert.equal(photo.decision, 'UNDECIDED'); assert.equal(photo.groupId, null);
      assert.equal(store.asset(photo.id, 'preview'), photo.previewPath);
      for (const file of [photo.previewPath!, photo.thumbnailPath!]) {
        assert.ok((await stat(file)).size > 0);
        const decoded = await sharp(file).raw().toBuffer({ resolveWithObject: true });
        assert.ok(decoded.info.width > 0); assert.ok(decoded.info.height > 0);
      }
      assert.deepEqual(events.filter(e => e.details.id === photo.id).map(e => e.event), ['PREVIEW_QUEUED', 'PREVIEW_STARTED', 'PREVIEW_WRITTEN', 'PREVIEW_DB_SAVED']);
    }
    const corrupt = photos.find(p => p.fileName === 'corrupt.png')!;
    assert.equal(corrupt.previewPath, null); assert.equal(corrupt.thumbnailPath, null);
    assert.match(corrupt.error!, /unsupported image format/);
    assert.ok(events.some(e => e.event === 'PREVIEW_FAILED' && e.details.id === corrupt.id && String(e.details.error).includes('Error:')));
    assert.ok(progress.some(p => p.kind === 'PREVIEW' && !p.active && p.done === 4 && p.failed === 1));
    const retained = valid[1]!, before = (await stat(retained.previewPath!)).mtimeMs;
    await unlink(valid[0]!.thumbnailPath!);
    events.length = 0;
    await new Pipeline(options).index(project.id);
    assert.ok((await stat(valid[0]!.thumbnailPath!)).size > 0);
    assert.equal((await stat(retained.previewPath!)).mtimeMs, before);
    assert.equal(events.filter(e => e.event === 'PREVIEW_QUEUED').length, 2);
  } finally { store.close(); }
});

test('cancel import previews at photo boundary and resume missing assets', async () => {
  await mkdir('.test-tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.test-tmp/preview-cancel-'));
  const input = path.join(root, 'input'); await mkdir(input);
  await build({ entryPoints: ['src/workers/preview.ts'], outfile: path.join(root, 'preview.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  for (const name of ['a.png', 'b.png']) await sharp({ create: { width: 32, height: 24, channels: 3, background: 'red' } }).png().toFile(path.join(input, name));
  const store = new Store(path.join(root, 'test.sqlite'));
  try {
    const project = store.create('Cancel', input);
    const options = { store, workerFile: path.join(root, 'analysis.cjs'), groupingFile: '', cache: path.join(root, 'cache'), model: null, faces: null, concurrency: 1, emit: (p: Progress) => { if (p.kind === 'PREVIEW' && p.done === 1) first.cancel(); }, log: () => {} };
    const first = new Pipeline(options); await first.index(project.id);
    assert.equal(store.project(project.id).status, 'INTERRUPTED');
    assert.equal(store.photos(project.id).filter(p => p.previewPath).length, 1);
    await new Pipeline({ ...options, emit: () => {} }).index(project.id);
    assert.equal(store.photos(project.id).filter(p => p.previewPath).length, 2);
    assert.equal(store.project(project.id).analyzed, 0);
  } finally { store.close(); }
});
