import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { generateLicenseKey, hashLicenseKey } from '../../src/licensing/keys.ts';
import { REVALIDATION_MS, TRIAL_DURATION_MS, type LicensePayload } from '../../src/licensing/types.ts';
import { signLicense } from '../../src/licensing/token.ts';
import type { LicenseDb, LicenseRow } from './types.ts';

export interface LicenseServerOptions {
  db: LicenseDb;
  privateKey: string;
  adminKey: string | null;
  now?: () => number;
}

type Json = { [key: string]: unknown } | Array<unknown>;

/** Planos aceitos no admin. O payload entregue ao app continua 'LIFETIME'. */
const PLANS = new Set(['LIFETIME', 'BETA_LIFETIME', 'MONTHLY', 'ANNUAL']);

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 64 * 1024) { reject(new Error('Body too large')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function createLicenseServer(options: LicenseServerOptions): Server {
  const nowMs = options.now ?? Date.now;

  const payload = (license: LicenseRow, deviceId: string): LicensePayload => ({
    licenseId: license.id,
    deviceId,
    plan: 'LIFETIME',
    issuedAt: nowMs(),
    checkAfter: nowMs() + REVALIDATION_MS,
    validUntil: license.expiresAt ? new Date(license.expiresAt).getTime() : null,
    maxDevices: license.maxDevices
  });
  const deviceHash = (deviceId: string): string => createHash('sha256').update(deviceId, 'utf8').digest('hex');

  const send = (response: ServerResponse, status: number, body: Json): void => {
    const text = JSON.stringify(body);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(text);
  };

  const admin = (request: IncomingMessage): boolean => {
    if (!options.adminKey) return false;
    return request.headers.authorization === `Bearer ${options.adminKey}`;
  };

  return createServer((request, response) => {
    const url = request.url?.split('?')[0] ?? '';
    void readBody(request).then(async body => {
      let input: { [key: string]: unknown } = {};
      if (body) {
        try { input = JSON.parse(body) as { [key: string]: unknown }; } catch { return send(response, 400, { error: 'INVALID_JSON' }); }
      }
      const path = url;
      if (request.method === 'POST' && path === '/licenses/trial/start') {
        const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
        const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 20) : '';
        if (!/^[A-Za-z0-9_-]{3,128}$/.test(deviceId)) return send(response, 400, { ok: false, reason: 'TRIAL_NOT_ELIGIBLE' });
        const hash = deviceHash(deviceId);
        if (await options.db.trialByDeviceHash(hash)) return send(response, 200, { ok: false, reason: 'TRIAL_ALREADY_USED' });
        if (await options.db.hasCommercialActivation(deviceId)) return send(response, 200, { ok: false, reason: 'TRIAL_NOT_ELIGIBLE' });
        const started = nowMs(), expires = started + TRIAL_DURATION_MS;
        const trial = await options.db.startTrial({ id: randomUUID(), deviceIdHash: hash, startedAt: new Date(started).toISOString(), expiresAt: new Date(expires).toISOString(), appVersion });
        if (!trial) return send(response, 200, { ok: false, reason: 'TRIAL_ALREADY_USED' });
        const signed = signLicense({ licenseId: trial.id, deviceId, plan: 'TRIAL', issuedAt: started, checkAfter: expires, validUntil: expires, maxDevices: 1 }, options.privateKey);
        return send(response, 201, { ok: true, token: signed.token, startedAt: trial.startedAt, expiresAt: trial.expiresAt });
      }
      if (request.method === 'POST' && path === '/licenses/activate') {
        const licenseKey = typeof input.licenseKey === 'string' ? input.licenseKey : '';
        const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
        const deviceName = typeof input.deviceName === 'string' ? input.deviceName.slice(0, 60) : '';
        const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 20) : '';
        if (!deviceId) return send(response, 400, { ok: false, reason: 'INVALID_DEVICE' });
        let hash: string;
        try { hash = hashLicenseKey(licenseKey); } catch { return send(response, 400, { ok: false, reason: 'INVALID_KEY' }); }
        const license = await options.db.byKeyHash(hash);
        if (!license) return send(response, 200, { ok: false, reason: 'INVALID_KEY' });
        if (license.status === 'REVOKED' || license.revokedAt) return send(response, 200, { ok: false, reason: 'REVOKED' });
        if (license.expiresAt && new Date(license.expiresAt).getTime() < nowMs()) return send(response, 200, { ok: false, reason: 'EXPIRED' });
        const existing = await options.db.activation(license.id, deviceId);
        if (existing && existing.revokedAt === null) {
          await options.db.touch(license.id, deviceId, appVersion, new Date(nowMs()).toISOString());
          await options.db.convertTrial(deviceHash(deviceId), new Date(nowMs()).toISOString());
          return send(response, 200, { ok: true, token: signLicense(payload(license, deviceId), options.privateKey).token });
        }
        if (!existing && (await options.db.activeCount(license.id)) >= license.maxDevices) return send(response, 200, { ok: false, reason: 'DEVICE_LIMIT' });
        if (existing && existing.revokedAt !== null) await options.db.deactivate(license.id, deviceId);
        await options.db.addActivation(license.id, deviceId, deviceName, appVersion, new Date(nowMs()).toISOString());
        await options.db.convertTrial(deviceHash(deviceId), new Date(nowMs()).toISOString());
        return send(response, 200, { ok: true, token: signLicense(payload(license, deviceId), options.privateKey).token });
      }
      if (request.method === 'POST' && path === '/licenses/validate') {
        const licenseId = typeof input.licenseId === 'string' ? input.licenseId : '';
        const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
        const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 20) : '';
        const license = await options.db.byId(licenseId);
        if (!license || license.status === 'REVOKED' || license.revokedAt) return send(response, 200, { valid: false, reason: 'REVOKED' });
        if (license.expiresAt && new Date(license.expiresAt).getTime() < nowMs()) return send(response, 200, { valid: false, reason: 'EXPIRED' });
        const activation = await options.db.activation(licenseId, deviceId);
        if (!activation || activation.revokedAt !== null) return send(response, 200, { valid: false, reason: 'REVOKED' });
        await options.db.touch(licenseId, deviceId, appVersion, new Date(nowMs()).toISOString());
        return send(response, 200, { valid: true });
      }
      if (request.method === 'POST' && path === '/licenses/deactivate') {
        const licenseId = typeof input.licenseId === 'string' ? input.licenseId : '';
        const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
        await options.db.deactivate(licenseId, deviceId);
        return send(response, 200, { ok: true });
      }
      if (path.startsWith('/admin/')) {
        if (!admin(request)) return send(response, request.headers.authorization ? 403 : 401, { error: 'UNAUTHORIZED' });
        if (request.method === 'GET' && path === '/admin/trials') return send(response, 200, { trials: (await options.db.listTrials(new Date(nowMs()).toISOString())).map(({ deviceIdHash, ...trial }) => ({ ...trial, deviceHashPrefix: deviceIdHash.slice(0, 12) })) });
        if (request.method === 'POST' && path === '/admin/licenses') {
          const customerName = typeof input.customerName === 'string' && input.customerName.trim() ? input.customerName.trim().slice(0, 120) : '';
          const customerEmail = typeof input.customerEmail === 'string' && input.customerEmail.trim() ? input.customerEmail.trim().slice(0, 160) : '';
          const maxDevices = Number.isInteger(input.maxDevices) && Number(input.maxDevices) >= 1 ? Number(input.maxDevices) : 2;
          if (!customerName) return send(response, 400, { error: 'INVALID_CUSTOMER' });
          const id = crypto.randomUUID();
          const key = generateLicenseKey();
          const createdAt = new Date(nowMs()).toISOString();
          let expiresAt: string | null = null;
          if (input.expiresAt && typeof input.expiresAt === 'string' && !Number.isNaN(Date.parse(input.expiresAt))) expiresAt = new Date(input.expiresAt).toISOString();
          const plan = typeof input.plan === 'string' && PLANS.has(input.plan) ? input.plan : 'LIFETIME';
          const purchasedVersion = typeof input.purchasedVersion === 'string' && input.purchasedVersion.trim() ? input.purchasedVersion.trim().slice(0, 20) : null;
          const updatesIncluded = Number.isInteger(input.updatesIncluded) && Number(input.updatesIncluded) >= 0 && Number(input.updatesIncluded) <= 24 ? Number(input.updatesIncluded) : null;
          const updatesUsed = Number.isInteger(input.updatesUsed) && Number(input.updatesUsed) >= 0 && Number(input.updatesUsed) <= 24 ? Number(input.updatesUsed) : 0;
          const orderId = typeof input.orderId === 'string' && input.orderId.trim() ? input.orderId.trim().slice(0, 64) : null;
          const license = await options.db.create({ id, keyHash: hashLicenseKey(key), customerName, customerEmail, plan, maxDevices, createdAt, expiresAt, orderId, purchasedVersion, updatesIncluded, updatesUsed });
          return send(response, 201, { license: licenseRedacted(license), licenseKey: key });
        }
        const idMatch = /^\/admin\/licenses\/([0-9a-f-]{36})\/(revoke|unrevoke)$/.exec(path);
        if (request.method === 'POST' && idMatch) {
          const license = await options.db.byId(idMatch[1]!);
          if (!license) return send(response, 404, { error: 'NOT_FOUND' });
          await options.db.setStatus(license.id, idMatch[2] === 'revoke' ? 'REVOKED' : 'ACTIVE', new Date(nowMs()).toISOString());
          return send(response, 200, { ok: true });
        }
        const listMatch = /^\/admin\/licenses\/([0-9a-f-]{36})\/activations$/.exec(path);
        if (request.method === 'GET' && listMatch) {
          const license = await options.db.byId(listMatch[1]!);
          if (!license) return send(response, 404, { error: 'NOT_FOUND' });
          return send(response, 200, { activations: await options.db.activations(license.id) });
        }
        if (request.method === 'GET' && path === '/admin/licenses') return send(response, 200, { licenses: (await options.db.list()).map(licenseRedacted) });
      }
      return send(response, 404, { error: 'NOT_FOUND' });
    }).catch(error => send(response, 500, { error: 'SERVER_ERROR', message: error instanceof Error ? error.message : String(error) }));
  });
}

function licenseRedacted(license: LicenseRow): { [key: string]: unknown } {
  const { keyHash, ...rest } = license;
  return { ...rest, keyHashPrefix: keyHash.slice(0, 8) };
}
