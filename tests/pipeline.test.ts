import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile, stat } from 'node:fs/promises';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import type { Progress } from '../src/types/domain.ts';
await mkdir('.test-tmp', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/pipeline-'));
// A deterministic I/O worker fixture tests orchestration only, never ships in the application.
const fixture = path.join(root, 'worker.cjs');
await writeFile(fixture, `const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs');const path=require('node:path');
parentPort.on('message',p=>{if(p==='CLOSE'){parentPort.close();return;}if(p.fileName==='corrupt.jpg'){parentPort.postMessage({error:'Unreadable fixture'});return;}fs.mkdirSync(workerData.cache,{recursive:true});const preview=path.join(workerData.cache,p.id+'.jpg');fs.writeFileSync(preview,'fixture');parentPort.postMessage({result:{width:10,height:10,captureDate:null,thumbnailPath:preview,previewPath:preview,metadata:{},embedding:null,hash:p.id,global:80,regional:80,light:90}});});`);
test('pipeline cancels at photo boundary, resumes cache, isolates failures, persists groups', async () => {
  const dir = path.join(root, 'input'); await mkdir(dir); const store = new Store(path.join(root, 'pipeline.sqlite')); const project = store.create('Pipeline', dir);
  for (const name of ['a.jpg', 'b.jpg', 'corrupt.jpg']) {
    const file = path.join(dir, name); await writeFile(file, name); const info = await stat(file);
    store.index(project.id, { path: file, name, extension: '.jpg', size: info.size, mtime: info.mtimeMs });
  }
  const events: Progress[] = [];
  const options = { store, workerFile: fixture, groupingFile: path.resolve('src/workers/grouping.ts'), cache: path.join(root, 'cache'), model: null, faces: null, concurrency: 1, emit: (p: Progress) => { events.push(p); if (p.done === 1 && p.active) first.cancel(); }, log: () => {} };
  const first = new Pipeline(options); await first.analyze(project.id);
  assert.equal(store.project(project.id).status, 'INTERRUPTED'); assert.equal(store.project(project.id).analyzed, 1);
  const resumed = new Pipeline({ ...options, emit: p => { events.push(p); } }); await resumed.analyze(project.id);
  assert.equal(store.project(project.id).status, 'READY'); assert.equal(store.project(project.id).analyzed, 2); assert.equal(store.project(project.id).failed, 1);
  assert.equal(store.photos(project.id).filter(p => p.groupId).length, 2);
  assert.ok(events.some(p => p.done === 1 && p.stage === 'Preparando fotografias')); assert.equal(events.at(-1)?.active, false);
  store.close();
});
