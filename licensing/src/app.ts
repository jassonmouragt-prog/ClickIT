import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { generateLicenseKey, hashLicenseKey } from '../../src/licensing/keys.ts';
import { REVALIDATION_MS, TRIAL_DURATION_MS, type LicensePayload } from '../../src/licensing/types.ts';
import { signLicense } from '../../src/licensing/token.ts';
import { isUniqueViolation, type LicenseDb, type LicenseRow } from './types.ts';

export interface LicenseServerOptions {
  db: LicenseDb;
  privateKey: string;
  adminKey: string | null;
  now?: () => number;
}

/** Requisição normalizada para o handler (independe de node:http ou serverless). */
export interface LicenseRequest {
  method: string;
  /** Caminho sem query string. */
  path: string;
  authorization: string | null;
  rawBody: string | null;
}

export interface LicenseResponse {
  status: number;
  json: { [key: string]: unknown } | Array<unknown>;
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

function licenseRedacted(license: LicenseRow): Json {
  const { keyHash, ...rest } = license;
  return { ...rest, keyHashPrefix: keyHash.slice(0, 8) };
}

/**
 * Núcleo da License API, independente de transporte.
 * Usado pelo servidor node:http e pelo adapter serverless (Vercel).
 */
export function createLicenseHandler(options: LicenseServerOptions): (request: LicenseRequest) => Promise<LicenseResponse> {
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
  const admin = (authorization: string | null): boolean => Boolean(options.adminKey) && authorization === `Bearer ${options.adminKey}`;

  return async (request: LicenseRequest): Promise<LicenseResponse> => {
    const path = request.path;

    if (request.method === 'GET' && path === '/health') {
      let databaseOk = false;
      try { databaseOk = await options.db.ping(); } catch { /* banco inacessível */ }
      return databaseOk
        ? { status: 200, json: { ok: true, database: 'ok' } }
        : { status: 503, json: { ok: false, database: 'error' } };
    }

    let input: { [key: string]: unknown } = {};
    if (request.rawBody) {
      try { input = JSON.parse(request.rawBody) as { [key: string]: unknown }; } catch { return { status: 400, json: { error: 'INVALID_JSON' } }; }
    }

    if (request.method === 'POST' && path === '/licenses/trial/start') {
      const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
      const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 20) : '';
      if (!/^[A-Za-z0-9_-]{3,128}$/.test(deviceId)) return { status: 400, json: { ok: false, reason: 'TRIAL_NOT_ELIGIBLE' } };
      const hash = deviceHash(deviceId);
      if (await options.db.trialByDeviceHash(hash)) return { status: 200, json: { ok: false, reason: 'TRIAL_ALREADY_USED' } };
      if (await options.db.hasCommercialActivation(deviceId)) return { status: 200, json: { ok: false, reason: 'TRIAL_NOT_ELIGIBLE' } };
      const started = nowMs(), expires = started + TRIAL_DURATION_MS;
      const trial = await options.db.startTrial({ id: randomUUID(), deviceIdHash: hash, startedAt: new Date(started).toISOString(), expiresAt: new Date(expires).toISOString(), appVersion });
      if (!trial) return { status: 200, json: { ok: false, reason: 'TRIAL_ALREADY_USED' } };
      const signed = signLicense({ licenseId: trial.id, deviceId, plan: 'TRIAL', issuedAt: started, checkAfter: expires, validUntil: expires, maxDevices: 1 }, options.privateKey);
      return { status: 201, json: { ok: true, token: signed.token, startedAt: trial.startedAt, expiresAt: trial.expiresAt } };
    }
    if (request.method === 'POST' && path === '/licenses/activate') {
      const licenseKey = typeof input.licenseKey === 'string' ? input.licenseKey : '';
      const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
      const deviceName = typeof input.deviceName === 'string' ? input.deviceName.slice(0, 60) : '';
      const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 20) : '';
      if (!deviceId) return { status: 400, json: { ok: false, reason: 'INVALID_DEVICE' } };
      let hash: string;
      try { hash = hashLicenseKey(licenseKey); } catch { return { status: 400, json: { ok: false, reason: 'INVALID_KEY' } }; }
      const license = await options.db.byKeyHash(hash);
      if (!license) return { status: 200, json: { ok: false, reason: 'INVALID_KEY' } };
      if (license.status === 'REVOKED' || license.revokedAt) return { status: 200, json: { ok: false, reason: 'REVOKED' } };
      if (license.expiresAt && new Date(license.expiresAt).getTime() < nowMs()) return { status: 200, json: { ok: false, reason: 'EXPIRED' } };
      const existing = await options.db.activation(license.id, deviceId);
      if (existing && existing.revokedAt === null) {
        await options.db.touch(license.id, deviceId, appVersion, new Date(nowMs()).toISOString());
        await options.db.convertTrial(deviceHash(deviceId), new Date(nowMs()).toISOString());
        return { status: 200, json: { ok: true, token: signLicense(payload(license, deviceId), options.privateKey).token } };
      }
      if (!existing && (await options.db.activeCount(license.id)) >= license.maxDevices) return { status: 200, json: { ok: false, reason: 'DEVICE_LIMIT' } };
      if (existing && existing.revokedAt !== null) await options.db.deactivate(license.id, deviceId);
      await options.db.addActivation(license.id, deviceId, deviceName, appVersion, new Date(nowMs()).toISOString());
      await options.db.convertTrial(deviceHash(deviceId), new Date(nowMs()).toISOString());
      return { status: 200, json: { ok: true, token: signLicense(payload(license, deviceId), options.privateKey).token } };
    }
    if (request.method === 'POST' && path === '/licenses/validate') {
      const licenseId = typeof input.licenseId === 'string' ? input.licenseId : '';
      const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
      const appVersion = typeof input.appVersion === 'string' ? input.appVersion.slice(0, 20) : '';
      const license = await options.db.byId(licenseId);
      if (!license || license.status === 'REVOKED' || license.revokedAt) return { status: 200, json: { valid: false, reason: 'REVOKED' } };
      if (license.expiresAt && new Date(license.expiresAt).getTime() < nowMs()) return { status: 200, json: { valid: false, reason: 'EXPIRED' } };
      const activation = await options.db.activation(licenseId, deviceId);
      if (!activation || activation.revokedAt !== null) return { status: 200, json: { valid: false, reason: 'REVOKED' } };
      await options.db.touch(licenseId, deviceId, appVersion, new Date(nowMs()).toISOString());
      return { status: 200, json: { valid: true } };
    }
    if (request.method === 'POST' && path === '/licenses/deactivate') {
      const licenseId = typeof input.licenseId === 'string' ? input.licenseId : '';
      const deviceId = typeof input.deviceId === 'string' ? input.deviceId : '';
      await options.db.deactivate(licenseId, deviceId);
      return { status: 200, json: { ok: true } };
    }
    if (path.startsWith('/admin/')) {
      if (!admin(request.authorization)) return { status: request.authorization ? 403 : 401, json: { error: 'UNAUTHORIZED' } };
      if (request.method === 'GET' && path === '/admin/trials') return { status: 200, json: { trials: (await options.db.listTrials(new Date(nowMs()).toISOString())).map(({ deviceIdHash, ...trial }) => ({ ...trial, deviceHashPrefix: deviceIdHash.slice(0, 12) })) } };
      if (request.method === 'POST' && path === '/admin/licenses') {
        const customerName = typeof input.customerName === 'string' && input.customerName.trim() ? input.customerName.trim().slice(0, 120) : '';
        const customerEmail = typeof input.customerEmail === 'string' && input.customerEmail.trim() ? input.customerEmail.trim().slice(0, 160) : '';
        const maxDevices = Number.isInteger(input.maxDevices) && Number(input.maxDevices) >= 1 ? Number(input.maxDevices) : 2;
        if (!customerName) return { status: 400, json: { error: 'INVALID_CUSTOMER' } };
        const orderId = typeof input.orderId === 'string' && input.orderId.trim() ? input.orderId.trim().slice(0, 64) : null;
        const plan = typeof input.plan === 'string' && PLANS.has(input.plan) ? input.plan : 'LIFETIME';
        const purchasedVersion = typeof input.purchasedVersion === 'string' && input.purchasedVersion.trim() ? input.purchasedVersion.trim().slice(0, 20) : null;
        const updatesIncluded = Number.isInteger(input.updatesIncluded) && Number(input.updatesIncluded) >= 0 && Number(input.updatesIncluded) <= 24 ? Number(input.updatesIncluded) : null;
        const updatesUsed = Number.isInteger(input.updatesUsed) && Number(input.updatesUsed) >= 0 && Number(input.updatesUsed) <= 24 ? Number(input.updatesUsed) : 0;

        // Idempotência: orderNsu cria a licença apenas uma vez; nas repetições
        // devolve a licença existente (sem a chave, pois o hash já é o único
        // rastro persistido — a chave plain-text fica no pedido da landing).
        if (orderId) {
          const existingOrder = await options.db.byOrderNsu(orderId);
          if (existingOrder) return { status: 200, json: { license: licenseRedacted(existingOrder), licenseKey: null, already: true } };
        }

        const id = randomUUID();
        const key = generateLicenseKey();
        const createdAt = new Date(nowMs()).toISOString();
        let expiresAt: string | null = null;
        if (input.expiresAt && typeof input.expiresAt === 'string' && !Number.isNaN(Date.parse(input.expiresAt))) expiresAt = new Date(input.expiresAt).toISOString();
        try {
          const license = await options.db.create({ id, keyHash: hashLicenseKey(key), customerName, customerEmail, plan, maxDevices, createdAt, expiresAt, orderId, purchasedVersion, updatesIncluded, updatesUsed });
          return { status: 201, json: { license: licenseRedacted(license), licenseKey: key } };
        } catch (error) {
          if (orderId && isUniqueViolation(error)) {
            const existing = await options.db.byOrderNsu(orderId);
            if (existing) return { status: 200, json: { license: licenseRedacted(existing), licenseKey: null, already: true } };
          }
          throw error;
        }
      }
      const idMatch = /^\/admin\/licenses\/([0-9a-f-]{36})\/(revoke|unrevoke)$/.exec(path);
      if (request.method === 'POST' && idMatch) {
        const license = await options.db.byId(idMatch[1]!);
        if (!license) return { status: 404, json: { error: 'NOT_FOUND' } };
        await options.db.setStatus(license.id, idMatch[2] === 'revoke' ? 'REVOKED' : 'ACTIVE', new Date(nowMs()).toISOString());
        return { status: 200, json: { ok: true } };
      }
      const listMatch = /^\/admin\/licenses\/([0-9a-f-]{36})\/activations$/.exec(path);
      if (request.method === 'GET' && listMatch) {
        const license = await options.db.byId(listMatch[1]!);
        if (!license) return { status: 404, json: { error: 'NOT_FOUND' } };
        return { status: 200, json: { activations: await options.db.activations(license.id) } };
      }
      if (request.method === 'GET' && path === '/admin/licenses') return { status: 200, json: { licenses: (await options.db.list()).map(licenseRedacted) } };
    }
    return { status: 404, json: { error: 'NOT_FOUND' } };
  };
}

/** Servidor node:http persistente (dev/self-hosted). Em serverless use createLicenseHandler. */
export function createLicenseServer(options: LicenseServerOptions): Server {
  const handler = createLicenseHandler(options);
  return createServer((request, response) => {
    const path = request.url?.split('?')[0] ?? '';
    void readBody(request)
      .then(async (rawBody) => {
        const { status, json } = await handler({
          method: request.method ?? 'GET',
          path,
          authorization: request.headers.authorization ?? null,
          rawBody,
        });
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(json));
      })
      .catch((error) => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'SERVER_ERROR', message: error instanceof Error ? error.message : String(error) }));
      });
  });
}