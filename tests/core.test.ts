import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../src/database/store.ts';
import { cacheKey, supported, walk, inside } from '../src/lib/files.ts';
import { decision, id, name, settings } from '../src/lib/validation.ts';
import { makeAnalysis, sharpness } from '../src/ai/quality.ts';
import { group, rank, cosine } from '../src/ai/grouping.ts';
import type { Candidate } from '../src/ai/grouping.ts';
import { exportPhotos } from '../src/services/export.ts';
import { filterPhotos } from '../src/features/photos.ts';
import type { Face } from '../src/types/domain.ts';
await mkdir('.test-tmp', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/run-'));
const face = (eyes: Face['eyes'], focus = 90): Face => ({ x: .2, y: .2, width: .3, height: .4, sharpness: focus, eyes, blinkLeft: eyes === 'CLOSED' ? .9 : .05, blinkRight: eyes === 'CLOSED' ? .9 : .05 });
const candidate = (id: string, focus: number, embedding: number[] | null = [1, 0], faces: Face[] = []): Candidate => ({ id, date: '2026-10-05T12:00:00Z', hash: id, embedding, analysis: makeAnalysis(focus, focus, 85, faces, true, !!embedding) });
test('extension detection includes case-insensitive raster and RAW', () => { for (const f of ['a.JPG', 'a.JpEg', 'a.png', 'a.CR3', 'a.NEF', 'a.arw', 'a.raf', 'a.dng', 'a.cr2']) assert.ok(supported(f)); assert.equal(supported('a.jpg.exe'), false); });
test('cache invalidates path, size and mtime independently', () => { const a = cacheKey('a.jpg', 10, 5); assert.equal(a, cacheKey('a.jpg', 10, 5)); for (const v of [cacheKey('b.jpg', 10, 5), cacheKey('a.jpg', 11, 5), cacheKey('a.jpg', 10, 6)]) assert.notEqual(a, v); });
test('import recursively discovers compatible files; cancellation stops iteration', async () => {
  const dir = path.join(root, 'import'); await mkdir(path.join(dir, 'nested'), { recursive: true });
  await writeFile(path.join(dir, 'a.JPG'), 'a'); await writeFile(path.join(dir, 'nested', 'b.png'), 'b'); await writeFile(path.join(dir, 'ignored.txt'), 'x');
  const files = []; for await (const file of walk(dir, () => false)) files.push(file); assert.equal(files.length, 2);
  const cancelled = []; for await (const file of walk(dir, () => true)) cancelled.push(file); assert.equal(cancelled.length, 0);
});
test('sharpness distinguishes constant and detailed images', () => { const flat = new Uint8Array(64 * 64).fill(100), detailed = Uint8Array.from(flat, (_, i) => (i + Math.floor(i / 64)) % 2 ? 0 : 255); assert.equal(sharpness(flat, 64, 64), 0); assert.ok(sharpness(detailed, 64, 64) > 80); });
test('sharp face and blurred background are not a focus error', () => { const a = makeAnalysis(12, 20, 85, [face('OPEN')], true, true); assert.equal(a.blur, 'DOF_POSSIBLE'); assert.ok(a.overall > 80); });
test('creative motion blur remains uncertain, never rejected', () => { const a = makeAnalysis(8, 12, 70, [], true, true); assert.equal(a.blur, 'UNCERTAIN'); assert.ok(a.confidence < .5); });
test('relative ranking prefers sharper B over A and C', () => { assert.equal(rank([candidate('A', 40), candidate('B', 95), candidate('C', 62)])[0]?.id, 'B'); });
test('eyes open outrank closed with otherwise equal inputs', () => { const a = candidate('A', 90, [1, 0], [face('CLOSED')]), b = candidate('B', 90, [1, 0], [face('OPEN')]); assert.equal(rank([a, b])[0]?.id, 'B'); });
test('groups require visual similarity, never time or color alone', () => { const result = group([candidate('A', 60, [1, 0]), candidate('B', 90, [.999, .001]), candidate('C', 80, [0, 1])]); assert.equal(result.length, 2); assert.deepEqual(result[0]?.ids, ['B', 'A']); assert.equal(cosine([1, 0], [0, 1]), 0); });
test('missing embeddings do not invent groups; exact byte hashes still deduplicate', () => { const a = candidate('A', 80, null), b = candidate('B', 90, null); assert.equal(group([a, b]).length, 2); b.hash = a.hash; assert.equal(group([a, b])[0]?.duplicate, true); });
test('SQLite persists projects, resumes interruption, caches unchanged photos and preserves human decisions', () => {
  const file = path.join(root, 'database.sqlite'); let store = new Store(file); const project = store.create('Wedding', root);
  const entry = { path: path.join(root, 'photo.jpg'), name: 'photo.jpg', extension: '.jpg', size: 10, mtime: 100 };
  assert.equal(store.index(project.id, entry), true); assert.equal(store.index(project.id, entry), false);
  const p = store.photos(project.id)[0]!; store.result(p.id, { width: 100, height: 100, captureDate: null, thumbnailPath: 'thumb', previewPath: 'preview', metadata: { iso: 100 }, analysis: candidate(p.id, 90).analysis, embedding: [1, 0], hash: '123' });
  let candidates = store.candidates(project.id); store.saveGroups(project.id, group(candidates), candidates); assert.equal(store.photo(p.id).decision, 'AI_SELECTED');
  store.decide(p.id, { status: 'REJECTED', rating: 4, favorite: true }); candidates = store.candidates(project.id); store.saveGroups(project.id, group(candidates), candidates);
  assert.equal(store.photo(p.id).decision, 'REJECTED'); assert.equal(store.photo(p.id).rating, 4); assert.equal(store.photo(p.id).favorite, true);
  assert.equal(store.db.prepare('SELECT COUNT(*) n FROM decision_history').get()?.n, 1);
  store.status(project.id, 'ANALYZING'); store.close(); store = new Store(file);
  assert.equal(store.project(project.id).status, 'INTERRUPTED'); assert.equal(store.project(project.id).analyzed, 1); assert.equal(store.photo(p.id).metadata.iso, 100);
  assert.equal(store.index(project.id, { ...entry, size: 11 }), true); assert.equal(store.photo(p.id).analysis, null); assert.equal(store.photo(p.id).decision, 'REJECTED'); store.close();
});
test('keep dismisses warnings and persists manual selection', () => {
  const s = new Store(':memory:'), p = s.create('P', root); s.index(p.id, { path: 'p.jpg', name: 'p.jpg', extension: '.jpg', size: 1, mtime: 1 });
  const photo = s.photos(p.id)[0]!; s.decide(photo.id, { keep: true }); assert.equal(s.photo(photo.id).decision, 'SELECTED'); assert.equal(s.photo(photo.id).keep, true); assert.equal(filterPhotos(s.photos(p.id), 'BLUR', '').length, 0); s.close();
});
test('IPC validation rejects unknown fields, unsafe values and AI-only status', () => {
  assert.throws(() => id('../photo')); assert.throws(() => name(' ')); assert.throws(() => decision({ status: 'AI_SELECTED' })); assert.throws(() => decision({ rating: 6 })); assert.throws(() => decision({ delete: true })); assert.throws(() => settings({ mode: 'AUTO', concurrency: 100 }));
  assert.deepEqual(decision({ rating: 5, status: 'SELECTED' }), { rating: 5, status: 'SELECTED' }); assert.equal(inside(root, path.join(root, 'safe')), true); assert.equal(inside(root, path.resolve(root, '../other')), false);
});
test('export preserves original RAW bytes, handles collisions, supports list and cancellation', async () => {
  const source = path.join(root, 'original.CR3'); await writeFile(source, 'RAW original immutable fixture'); const info = await stat(source);
  const s = new Store(':memory:'), p = s.create('Export', root); s.index(p.id, { path: source, name: 'original.CR3', extension: '.cr3', size: info.size, mtime: info.mtimeMs }); const photo = s.photos(p.id)[0]!;
  const destination = path.join(root, 'out'); let cancelled = false;
  const result = await exportPhotos([photo, photo], destination, 'COPY', () => cancelled, () => { cancelled = true; });
  assert.equal(result.copied, 1); assert.equal(result.cancelled, true); const names = (await readdir(destination)).filter(n => !n.startsWith('.')); assert.equal(names.length, 1); assert.ok(names[0]?.endsWith('.cr3')); assert.equal(await readFile(path.join(destination, names[0]!), 'utf8'), 'RAW original immutable fixture'); assert.equal(await readFile(source, 'utf8'), 'RAW original immutable fixture');
  const again = await exportPhotos([photo], destination, 'COPY', () => false, () => {}); assert.equal(again.copied, 1); assert.equal((await readdir(destination)).filter(n => !n.startsWith('.')).length, 2);
  await exportPhotos([photo], destination, 'LIST', () => false, () => {}); const manifest = (await readdir(destination)).find(n => n.startsWith('ClickIT-') && n.endsWith('.json'))!; assert.equal(JSON.parse(await readFile(path.join(destination, manifest), 'utf8')).photos[0].file, source);
  const reimport = []; for await (const file of walk(destination, () => false)) reimport.push(file); assert.equal(reimport.length, 0); s.close();
});
test('export fails safely when the original has changed', async () => {
  const source = path.join(root, 'changed.jpg'); await writeFile(source, 'old'); const info = await stat(source); const s = new Store(':memory:'), p = s.create('Changed', root); s.index(p.id, { path: source, name: 'changed.jpg', extension: '.jpg', size: info.size, mtime: info.mtimeMs });
  await writeFile(source, 'new content'); const result = await exportPhotos(s.photos(p.id), path.join(root, 'changed-out'), 'COPY', () => false, () => {}); assert.equal(result.copied, 0); assert.equal(result.errors.length, 1); assert.equal((await readdir(path.join(root, 'changed-out'))).filter(n => !n.startsWith('.')).length, 0); s.close();
});
