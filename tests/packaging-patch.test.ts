import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('NSIS patch applies exactly once and fails closed on version/source drift', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'clickit-nsis-patch-'));
  const patch = JSON.parse(await readFile('patches/app-builder-lib-26.15.3-nsis.json', 'utf8')) as {
    versions: Record<string, string>; file: string; before: string; after: string;
  };
  try {
    await mkdir(path.join(root, 'scripts'), { recursive: true });
    await mkdir(path.join(root, 'patches'), { recursive: true });
    await copyFile('scripts/apply-nsis-patch.mjs', path.join(root, 'scripts/apply-nsis-patch.mjs'));
    await copyFile('patches/app-builder-lib-26.15.3-nsis.json', path.join(root, 'patches/app-builder-lib-26.15.3-nsis.json'));
    for (const [name, version] of Object.entries(patch.versions)) {
      await mkdir(path.join(root, 'node_modules', name), { recursive: true });
      await writeFile(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ version }));
    }
    const target = path.join(root, patch.file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, patch.before);
    const run = (...args: string[]) => spawnSync(process.execPath, [path.join(root, 'scripts/apply-nsis-patch.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(run('--check').status, 1, 'missing patch must fail verification');
    assert.equal(run().status, 0);
    assert.equal(await readFile(target, 'utf8'), patch.after);
    assert.equal(run().status, 0, 'second application must be idempotent');
    assert.equal(run('--check').status, 0);
    await writeFile(path.join(root, 'node_modules/app-builder-lib/package.json'), JSON.stringify({ version: '99.0.0' }));
    const mismatch = run();
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /expected 26\.15\.3, installed 99\.0\.0/);
    assert.equal(await readFile(target, 'utf8'), patch.after, 'version mismatch must not modify files');
    await writeFile(path.join(root, 'node_modules/app-builder-lib/package.json'), JSON.stringify({ version: '26.15.3' }));
    await writeFile(target, 'changed upstream source');
    const drift = run();
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /expected source does not match/);
    assert.equal(await readFile(target, 'utf8'), 'changed upstream source');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
