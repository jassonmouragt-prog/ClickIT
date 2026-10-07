import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { fileLicenseStore, plainCipher } from '../src/licensing/storage.ts';
import { LicenseManager, devAllowed, type LicenseHttp } from '../src/licensing/manager.ts';
import { signLicense } from '../src/licensing/token.ts';
import { generateLicenseKey, validLicenseKey, hashLicenseKey, normalizeLicenseKey } from '../src/licensing/keys.ts';
import { deviceIdFromGuid, RE_MACHINE_GUID } from '../src/licensing/device.ts';
import { REVALIDATION_MS } from '../src/licensing/types.ts';

await mkdir('.test-tmp', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/licensing-'));
const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const downHttp = {
  post: async (): Promise<never> => { throw new Error('network unreachable'); }
};

function manager(options: { now?: () => number; http?: LicenseHttp; dev?: boolean } = {}): LicenseManager {
  return new LicenseManager({
    file: fileLicenseStore(path.join(root, `m-${Math.random().toString(36).slice(2)}.json`), plainCipher()),
    http: options.http ?? downHttp,
    publicKey,
    deviceId: 'device-a',
    deviceName: 'PC-A',
    appVersion: '0.1.0',
    devAllowed: options.dev ?? false,
    now: options.now
  });
}

test('license keys are formatted, random and hashed without plaintext reuse', () => {
  const key = generateLicenseKey();
  assert.ok(validLicenseKey(key));
  assert.equal(hashLicenseKey(key), hashLicenseKey(key.toLowerCase()));
  assert.notEqual(generateLicenseKey(), generateLicenseKey());
  assert.equal(validLicenseKey('abc'), false);
  assert.ok(key !== hashLicenseKey(key).slice(0, 20));
});

test('signed license round-trips and rejects tampered tokens', async () => {
  const payload = { licenseId: 'id', deviceId: 'device-a', plan: 'LIFETIME' as const, issuedAt: 1, checkAfter: 1 + REVALIDATION_MS, validUntil: null, maxDevices: 2 };
  const token = signLicense(payload, privateKey).token;
  const { verifyLicense } = await import('../src/licensing/token.ts');
  const verified = verifyLicense(token, publicKey)!;
  assert.equal(verified.deviceId, 'device-a');
  const parts = token.split('.');
  const sig = parts[1]!;
  const flipAt = Math.max(1, Math.floor(sig.length / 2));
  const flippedSig = sig.slice(0, flipAt) + (sig[flipAt] === 'A' ? 'B' : 'A') + sig.slice(flipAt + 1);
  assert.equal(verifyLicense(`${parts[0]}.${flippedSig}`, publicKey), null);
  assert.equal(verifyLicense('CLICKIT.not-a-token', publicKey), null);
  assert.equal(verifyLicense(token, publicKey.replace('MCow', 'MCoK')), null);
});

test('device id derives stably from the Windows MachineGuid and is not the raw GUID', () => {
  assert.ok(RE_MACHINE_GUID.test('6F9619FF-8B86-D011-B42D-00CF4FC964FF'));
  const a = deviceIdFromGuid('6F9619FF-8B86-D011-B42D-00CF4FC964FF');
  assert.equal(a, deviceIdFromGuid('6f9619ff-8b86-d011-b42d-00cf4fc964ff'));
  assert.equal(a.length, 32);
  assert.notEqual(a.toLowerCase(), '6f9619ff8b86d011b42d00cf4fc964ff');
});

test('unactivated app reports UNACTIVATED and requires a license', async () => {
  const status = await manager().status();
  assert.equal(status.state, 'UNACTIVATED');
});

test('invalid key format or unknown key is rejected', async () => {
  const m = manager();
  assert.equal((await m.activate('minha-chave')).state, 'INVALID_KEY');
  const serverLike: LicenseHttp = {
    post: async (): Promise<{ ok: boolean; status: number; data: { [key: string]: unknown } }> => ({ ok: true, status: 200, data: { ok: false, reason: 'INVALID_KEY' } })
  };
  const unknown = new LicenseManager({ file: fileLicenseStore(path.join(root, `unknown-${Math.random()}.json`), plainCipher()), http: serverLike, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0' });
  assert.equal((await unknown.activate('CLICKIT-AAAA-0000-0000')).state, 'INVALID_KEY');
});

test('server unavailable during activation reports SERVER_UNAVAILABLE (no fake approval)', async () => {
  assert.equal((await manager({ http: { post: async () => ({ ok: true, status: 200, data: { ok: true, token: 'bad' } }) } }).activate(generateLicenseKey())).state, 'SERVER_UNAVAILABLE');
});

test('tampered local token reports LOCAL_TAMPERED, never unlocked', async () => {
  const file = fileLicenseStore(path.join(root, 'tampered.json'), plainCipher());
  const foreign = signLicense({ licenseId: 'x', deviceId: 'device-a', plan: 'LIFETIME', issuedAt: 1, checkAfter: 1, validUntil: null, maxDevices: 2 }, privateKey);
  file.save({ token: `${foreign.token.split('.')[0]!}.YQ`, deviceId: 'device-a', deviceName: 'PC-A', lastCheck: Date.now(), activatedAt: Date.now() });
  const m = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => Date.now() });
  assert.equal((await m.status()).state, 'LOCAL_TAMPERED');
});

test('token issued for another device reports DEVICE_MISMATCH', async () => {
  const file = fileLicenseStore(path.join(root, 'mismatch.json'), plainCipher());
  const token = signLicense({ licenseId: 'x', deviceId: 'device-B', plan: 'LIFETIME', issuedAt: 1, checkAfter: 1, validUntil: null, maxDevices: 2 }, privateKey);
  file.save({ token: token.token, deviceId: 'device-B', deviceName: 'PC-B', lastCheck: Date.now(), activatedAt: Date.now() });
  const m = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => Date.now() });
  assert.equal((await m.status()).state, 'DEVICE_MISMATCH');
});

test('expired token (validUntil in the past) reports EXPIRED without network', async () => {
  const file = fileLicenseStore(path.join(root, 'expired.json'), plainCipher());
  const token = signLicense({ licenseId: 'x', deviceId: 'device-a', plan: 'LIFETIME', issuedAt: 1, checkAfter: 1, validUntil: Date.now() - 1000, maxDevices: 2 }, privateKey);
  file.save({ token: token.token, deviceId: 'device-a', deviceName: 'PC-A', lastCheck: Date.now(), activatedAt: Date.now() });
  const m = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => Date.now() });
  assert.equal((await m.status()).state, 'EXPIRED');
});

test('fresh valid license works offline (no revalidation within the 7-day window)', async () => {
  const file = fileLicenseStore(path.join(root, 'fresh.json'), plainCipher());
  const now = Date.now();
  const token = signLicense({ licenseId: 'x', deviceId: 'device-a', plan: 'LIFETIME', issuedAt: now, checkAfter: now + REVALIDATION_MS, validUntil: null, maxDevices: 2 }, privateKey);
  file.save({ token: token.token, deviceId: 'device-a', deviceName: 'PC-A', lastCheck: now, activatedAt: now });
  const m = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => now + 86_400_000 });
  const status = (await m.status());
  assert.equal(status.state, 'VALID');
});

test('offline inside the 30-day grace reports VALID_OFFLINE with days left', async () => {
  const file = fileLicenseStore(path.join(root, 'grace.json'), plainCipher());
  const now = Date.now();
  const token = signLicense({ licenseId: 'x', deviceId: 'device-a', plan: 'LIFETIME', issuedAt: now, checkAfter: now + REVALIDATION_MS, validUntil: null, maxDevices: 2 }, privateKey);
  file.save({ token: token.token, deviceId: 'device-a', deviceName: 'PC-A', lastCheck: now, activatedAt: now });
  const window = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => now + 9 * 86_400_000 });
  const status = (await window.status());
  assert.equal(status.state, 'VALID_OFFLINE');
  assert.ok((status.offlineDaysLeft ?? 0) >= 20);
});

test('offline after the 30-day grace reports GRACE_EXPIRED and blocks', async () => {
  const file = fileLicenseStore(path.join(root, 'grace-end.json'), plainCipher());
  const now = Date.now();
  const token = signLicense({ licenseId: 'x', deviceId: 'device-a', plan: 'LIFETIME', issuedAt: now, checkAfter: now + REVALIDATION_MS, validUntil: null, maxDevices: 2 }, privateKey);
  file.save({ token: token.token, deviceId: 'device-a', deviceName: 'PC-A', lastCheck: now, activatedAt: now });
  const m = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => now + 45 * 86_400_000 });
  assert.equal((await m.status()).state, 'GRACE_EXPIRED');
});

test('DEV bypass is honored only for unpackaged builds; production ignores it', async () => {
  assert.equal(devAllowed(false, '1'), true);
  assert.equal(devAllowed(true, '1'), false);
  assert.equal(devAllowed(false, undefined), false);
  const m = manager({ dev: true });
  const statused = await m.status();
  assert.equal(statused.state, 'VALID');
  const mProd = manager({ dev: false });
  assert.equal((await mProd.status()).state, 'UNACTIVATED');
});

test('deactivate clears local state and no longer grants access', async () => {
  const file = fileLicenseStore(path.join(root, 'clear.json'), plainCipher());
  const now = Date.now();
  const token = signLicense({ licenseId: 'x', deviceId: 'device-a', plan: 'LIFETIME', issuedAt: now, checkAfter: now + REVALIDATION_MS, validUntil: null, maxDevices: 2 }, privateKey);
  file.save({ token: token.token, deviceId: 'device-a', deviceName: 'PC-A', lastCheck: now, activatedAt: now });
  const m = new LicenseManager({ file, http: downHttp, publicKey, deviceId: 'device-a', deviceName: 'PC-A', appVersion: '0.1.0', now: () => now });
  assert.equal((await m.status()).state, 'VALID');
  assert.equal((await m.deactivate()).state, 'UNACTIVATED');
  assert.equal((await m.status()).state, 'UNACTIVATED');
  assert.equal(file.load(), null);
});

test('normalizing a key produces the canonical CLICKIT format', () => {
  assert.equal(normalizeLicenseKey(' clickit-abcd-ef01-2345 '), 'CLICKIT-ABCD-EF01-2345');
  assert.ok(validLicenseKey(normalizeLicenseKey('clickit-abcd-ef01-2345')));
});

await writeFile(path.join(root, 'README.txt'), 'ok');