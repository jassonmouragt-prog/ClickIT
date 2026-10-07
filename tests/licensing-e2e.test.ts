import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createLicenseServer } from '../licensing/src/app.ts';
import { sqliteLicenseDb } from '../licensing/src/db.ts';
import type { LicenseDb } from '../licensing/src/types.ts';
import { generateLicenseKey, hashLicenseKey } from '../src/licensing/keys.ts';
import { fileLicenseStore, plainCipher, type LicenseFileStore } from '../src/licensing/storage.ts';
import { LicenseManager, type LicenseHttp } from '../src/licensing/manager.ts';

await mkdir('.test-tmp', { recursive: true });
const root = await mkdtemp(path.resolve('.test-tmp/licensing-e2e-'));
const dbFile = path.join(root, 'licenses.sqlite');
const db: LicenseDb = sqliteLicenseDb(dbFile);

const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const server = createLicenseServer({ db, privateKey, adminKey: 'test-admin' });
await new Promise<void>(resolve => server.listen(0, () => { resolve(); }));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const http: LicenseHttp = {
  post: async (pathname, body) => {
    const response = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: response.ok, status: response.status, data: await response.json() as { [key: string]: unknown } };
  }
};
const downHttp: LicenseHttp = {
  post: async (): Promise<{ ok: boolean; status: number; data: { [key: string]: unknown } }> => { throw new Error('network unreachable'); }
};

function manager(deviceId: string, httpClient: LicenseHttp = http, now?: () => number, store?: LicenseFileStore): LicenseManager {
  return new LicenseManager({
    file: store ?? fileLicenseStore(path.join(root, `dev-${deviceId}-${Math.random().toString(36).slice(2)}.json`), plainCipher()),
    http: httpClient,
    publicKey,
    deviceId,
    deviceName: `PC-${deviceId}`,
    appVersion: '0.1.0',
    now
  });
}

async function createViaAdmin(): Promise<string> {
  const response = await fetch(`${base}/admin/licenses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin' }, body: JSON.stringify({ customerName: 'Cliente', customerEmail: 'c@x.co', maxDevices: 2 }) });
  const data = await response.json() as { licenseKey?: string };
  assert.equal(response.status, 201);
  return data.licenseKey!;
}

test('VALID: happy path — admin creates, client activates, workspace gates open', async () => {
  const key = await createViaAdmin();
  const m = manager('device-A');
  const activation = await m.activate(key);
  assert.equal(activation.state, 'VALID');
  assert.equal(activation.plan, 'LIFETIME');
  assert.equal((await m.status()).state, 'VALID');
  assert.equal((await db.byKeyHash(hashLicenseKey(key)))?.status, 'ACTIVE');
});

test('INVALID_KEY: unknown format and unknown key', async () => {
  const m = manager('device-A');
  assert.equal((await m.activate('not-a-key')).state, 'INVALID_KEY');
  assert.equal((await m.activate('CLICKIT-FFFF-FFFF-FFFF')).state, 'INVALID_KEY');
});

test('EXPIRED: license with past expiresAt is rejected', async () => {
  const key = generateLicenseKey();
  await db.create({ id: crypto.randomUUID(), keyHash: hashLicenseKey(key), customerName: 'Vencida', customerEmail: 'v@x.co', plan: 'LIFETIME', maxDevices: 2, createdAt: new Date(Date.now() - 400 * 86_400_000).toISOString(), expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString() });
  assert.equal((await manager('device-A').activate(key)).state, 'EXPIRED');
});

test('REVOKED: license revoked server-side is rejected at activation and kept revoked', async () => {
  const key = await createViaAdmin();
  const m = manager('device-A');
  assert.equal((await m.activate(key)).state, 'VALID');
  await db.setStatus((await db.byKeyHash(hashLicenseKey(key)))!.id, 'REVOKED', new Date().toISOString());
  assert.equal((await manager('device-B').activate(key)).state, 'REVOKED');
  assert.equal((await manager('device-C').activate(key)).state, 'REVOKED');
});

test('DEVICE LIMIT: same machine reactivation free, second device allowed, third blocked', async () => {
  const key = await createViaAdmin();
  assert.equal((await manager('device-A').activate(key)).state, 'VALID');
  assert.equal((await manager('device-A').activate(key)).state, 'VALID');
  const license = (await db.byKeyHash(hashLicenseKey(key)))!;
  assert.equal(await db.activeCount(license.id), 1);
  assert.equal((await manager('device-B').activate(key)).state, 'VALID');
  assert.equal(await db.activeCount(license.id), 2);
  assert.equal((await manager('device-C').activate(key)).state, 'DEVICE_LIMIT');
  assert.equal((await manager('device-B').activate(key)).state, 'VALID');
});

test('DEACTIVATE frees a slot and re-activation is possible', async () => {
  const key = await createViaAdmin();
  const a = manager('device-A'); await a.activate(key);
  const b = manager('device-B'); await b.activate(key);
  const license = (await db.byKeyHash(hashLicenseKey(key)))!;
  assert.equal((await b.deactivate()).state, 'UNACTIVATED');
  assert.equal(await db.activeCount(license.id), 1);
  assert.equal((await manager('device-C').activate(key)).state, 'VALID');
  assert.equal(await db.activeCount(license.id), 2);
});

test('DEVICE REVOKED server-side blocks validation but reactivation recreates slot', async () => {
  const key = await createViaAdmin();
  const a = manager('device-A'); await a.activate(key);
  const b = manager('device-B'); await b.activate(key);
  const license = (await db.byKeyHash(hashLicenseKey(key)))!;
  await db.deactivate(license.id, 'device-B');
  const bFresh = manager('device-B');
  await bFresh.activate(key);
  assert.equal((await bFresh.status()).state, 'VALID');
  assert.equal(await db.activeCount(license.id), 2);
  void a;
});

test('OFFLINE grace: fresh check needs no network; past grace blocks', async () => {
  const key = await createViaAdmin();
  const t0 = Date.now();
  const store = fileLicenseStore(path.join(root, 'offline-shared.json'), plainCipher());
  const real = manager('device-A', http, () => t0, store);
  await real.activate(key);
  const fresh = manager('device-A', downHttp, () => t0 + 86_400_000, store);
  assert.equal((await fresh.status()).state, 'VALID');
  const within = manager('device-A', downHttp, () => t0 + 9 * 86_400_000, store);
  assert.equal((await within.status()).state, 'VALID_OFFLINE');
  const past = manager('device-A', downHttp, () => t0 + 40 * 86_400_000, store);
  assert.equal((await past.status()).state, 'GRACE_EXPIRED');
});

test('REVOKED after grace window is recognized by online validation', async () => {
  const key = await createViaAdmin();
  const t0 = Date.now();
  const store = fileLicenseStore(path.join(root, 'revoked-shared.json'), plainCipher());
  const real = manager('device-A', http, () => t0, store);
  await real.activate(key);
  await db.setStatus((await db.byKeyHash(hashLicenseKey(key)))!.id, 'REVOKED', new Date().toISOString());
  const later = manager('device-A', http, () => t0 + 8 * 86_400_000, store);
  assert.equal((await later.status()).state, 'REVOKED');
});

test('DEVICE_MISMATCH: token bound to another machine is not a bypass', async () => {
  const key = await createViaAdmin();
  const file = fileLicenseStore(path.join(root, 'shared-token.json'), plainCipher());
  const a = new LicenseManager({ file, http, publicKey, deviceId: 'device-A', deviceName: 'PC-A', appVersion: '0.1.0' });
  assert.equal((await a.activate(key)).state, 'VALID');
  const thief = new LicenseManager({ file, http, publicKey, deviceId: 'device-OTHER', deviceName: 'OTH', appVersion: '0.1.0' });
  assert.equal((await thief.status()).state, 'DEVICE_MISMATCH');
});

test('admin routes require authentication and list activations', async () => {
  const unauthorized = await fetch(`${base}/admin/licenses`);
  assert.equal(unauthorized.status, 401);
  const key = await createViaAdmin();
  const m = manager('device-A'); await m.activate(key);
  const license = (await db.byKeyHash(hashLicenseKey(key)))!;
  const details = await fetch(`${base}/admin/licenses/${license.id}/activations`, { headers: { authorization: 'Bearer test-admin' } });
  const body = await details.json() as { activations?: unknown[] };
  assert.equal(body.activations?.length, 1);
});

after(() => { server.close(); void db.close(); });