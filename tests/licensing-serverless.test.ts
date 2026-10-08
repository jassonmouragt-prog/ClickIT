import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createLicenseHandler, type LicenseRequest, type LicenseResponse } from '../licensing/src/app.ts';
import { sqliteLicenseDb } from '../licensing/src/db.ts';
import type { LicenseDb } from '../licensing/src/types.ts';

const pair = generateKeyPairSync('ed25519');
const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ADMIN = 'serverless-admin-key';

const ORDER_NSU = 'CLICKIT-ORDER-AABBCCDDEEFF001122';

interface CallOptions {
  body?: unknown;
  authorization?: string;
}

type Call = (method: string, path: string, options?: CallOptions) => Promise<LicenseResponse>;

function setup(db: LicenseDb = sqliteLicenseDb(':memory:')) {
  const handler = createLicenseHandler({ db, privateKey, adminKey: ADMIN });
  const call: Call = async (method, path, options = {}) =>
    handler({
      method,
      path,
      authorization: options.authorization ?? null,
      rawBody: options.body === undefined ? null : JSON.stringify(options.body),
    });
  return { db, call };
}

async function createLicense(call: Call, orderId: string | null = ORDER_NSU) {
  return call('POST', '/admin/licenses', {
    authorization: `Bearer ${ADMIN}`,
    body: {
      customerName: 'Ana Silva',
      customerEmail: 'ana@exemplo.com',
      plan: 'BETA_LIFETIME',
      maxDevices: 2,
      updatesIncluded: 3,
      purchasedVersion: '0.1.0',
      orderId,
    },
  });
}

test('health: 200 {ok,database:"ok"} com banco acessível', async () => {
  const { call } = setup();
  const response = await call('GET', '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { ok: true, database: 'ok' });
});

test('health: 503 {ok:false,database:"error"} quando o banco não responde', async () => {
  const db = sqliteLicenseDb(':memory:');
  const broken = { ...db, ping: async () => false } as LicenseDb;
  const { call } = setup(broken);
  const response = await call('GET', '/health');
  assert.equal(response.status, 503);
  assert.deepEqual(response.json, { ok: false, database: 'error' });
});

test('admin: sem Bearer é 401 e com Bearer errado é 403', async () => {
  const { call } = setup();
  const missing = await call('POST', '/admin/licenses', { body: { customerName: 'Ana' } });
  assert.equal(missing.status, 401);
  const wrong = await call('POST', '/admin/licenses', { authorization: 'Bearer outra-chave', body: { customerName: 'Ana' } });
  assert.equal(wrong.status, 403);
});

test('admin: cria licença com os metadados comerciais', async () => {
  const { call } = setup();
  const response = await createLicense(call);
  assert.equal(response.status, 201);
  const body = response.json as { licenseKey: string; license: { [key: string]: unknown } };
  assert.match(body.licenseKey, /^CLICKIT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(body.license.plan, 'BETA_LIFETIME');
  assert.equal(body.license.maxDevices, 2);
  assert.equal(body.license.updatesIncluded, 3);
  assert.equal(body.license.purchasedVersion, '0.1.0');
  assert.equal(body.license.orderId, ORDER_NSU);
  assert.equal(body.license.customerEmail, 'ana@exemplo.com');
  assert.equal('keyHash' in body.license, false);
});

test('admin: orderNsu repetido não cria segunda licença (idempotência)', async () => {
  const { call } = setup();
  const first = await createLicense(call);
  const second = await createLicense(call);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  const firstBody = first.json as { licenseKey: string; license: { id: string } };
  const secondBody = second.json as { licenseKey: string | null; license: { id: string }; already: boolean };
  assert.equal(secondBody.already, true);
  assert.equal(secondBody.licenseKey, null);
  assert.equal(secondBody.license.id, firstBody.license.id);
});

test('activate: d1 e d2 passam, d3 é DEVICE_LIMIT', async () => {
  const { call } = setup();
  const body = await createLicense(call);
  const licenseKey = (body.json as { licenseKey: string }).licenseKey;

  const d1 = await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-1' } });
  assert.equal((d1.json as { ok: boolean }).ok, true);
  assert.ok((d1.json as { token: string }).token);

  const d1Again = await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-1' } });
  assert.equal((d1Again.json as { ok: boolean }).ok, true);

  const d2 = await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-2' } });
  assert.equal((d2.json as { ok: boolean }).ok, true);

  const d3 = await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-3' } });
  assert.equal((d3.json as { ok: boolean }).ok, false);
  assert.equal((d3.json as { reason: string }).reason, 'DEVICE_LIMIT');
});

test('deactivate: revogar device libera slot para um novo', async () => {
  const { call } = setup();
  const body = await createLicense(call);
  const licenseKey = (body.json as { licenseKey: string }).licenseKey;
  const licenseId = (body.json as { license: { id: string } }).license.id;

  await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-1' } });
  await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-2' } });

  const blocked = await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-3' } });
  assert.equal((blocked.json as { reason: string }).reason, 'DEVICE_LIMIT');

  const deactivate = await call('POST', '/licenses/deactivate', { body: { licenseId, deviceId: 'device-2' } });
  assert.equal(deactivate.status, 200);
  assert.deepEqual(deactivate.json, { ok: true });

  const validateRevoked = await call('POST', '/licenses/validate', { body: { licenseId, deviceId: 'device-2' } });
  assert.equal((validateRevoked.json as { valid: boolean }).valid, false);

  const freed = await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'device-3' } });
  assert.equal((freed.json as { ok: boolean }).ok, true);
});

test('trial: um por device; segundo negado; device com licença comercial negado', async () => {
  const { call } = setup();
  const first = await call('POST', '/licenses/trial/start', { body: { deviceId: 'trial-device-1', appVersion: '0.1.0' } });
  assert.equal(first.status, 201);
  assert.equal((first.json as { ok: boolean }).ok, true);
  assert.ok((first.json as { token: string }).token);

  const second = await call('POST', '/licenses/trial/start', { body: { deviceId: 'trial-device-1', appVersion: '0.1.0' } });
  assert.equal(second.status, 200);
  assert.deepEqual(second.json, { ok: false, reason: 'TRIAL_ALREADY_USED' });

  const body = await createLicense(call);
  const licenseKey = (body.json as { licenseKey: string }).licenseKey;
  await call('POST', '/licenses/activate', { body: { licenseKey, deviceId: 'buyer-device-1' } });
  const buyerTrial = await call('POST', '/licenses/trial/start', { body: { deviceId: 'buyer-device-1', appVersion: '0.1.0' } });
  assert.equal(buyerTrial.status, 200);
  assert.deepEqual(buyerTrial.json, { ok: false, reason: 'TRIAL_NOT_ELIGIBLE' });
});

test('rota desconhecida é 404', async () => {
  const { call } = setup();
  const missing = await call('GET', '/outra-rota');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { error: 'NOT_FOUND' });
});

test('body não-JSON é 400 INVALID_JSON', async () => {
  const db = sqliteLicenseDb(':memory:');
  const handler = createLicenseHandler({ db, privateKey, adminKey: ADMIN });
  const request: LicenseRequest = { method: 'POST', path: '/licenses/activate', authorization: null, rawBody: '{invalid' };
  const response = await handler(request);
  assert.equal(response.status, 400);
  assert.equal((response.json as { error: string }).error, 'INVALID_JSON');
});
