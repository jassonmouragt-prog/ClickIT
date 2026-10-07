import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('production bundle carries no private key / dev keypair and honors no trivial bypass', () => {
  if (!existsSync('dist/main.cjs')) return;
  const source = readFileSync('dist/main.cjs', 'utf8');
  assert.equal(source.includes('BEGIN PRIVATE KEY'), false, 'bundle must never embed the signing private key');
  assert.equal(source.includes('dev-keypair.json'), false, 'bundle must never reference the dev keypair file');
  assert.equal(source.includes('-----END PRIVATE KEY-----'), false);
  if (source.includes('CLICKIT_DEV_LICENSE')) {
    assert.ok(source.includes('isPackaged'), 'dev bypass must be gated behind app.isPackaged');
  }
});

test('portable/installer asar files list must not include the licensing server source', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { build?: { files?: string[] } };
  const files = pkg.build?.files ?? [];
  assert.ok(!files.some(entry => String(entry).includes('licensing')), 'licensing API folder must stay out of the desktop package');
});