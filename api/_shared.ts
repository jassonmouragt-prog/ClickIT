import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLicenseHandler, type LicenseResponse } from '../licensing/src/app.ts';
import { postgresLicenseDb } from '../licensing/src/db.ts';
import type { LicenseDb } from '../licensing/src/types.ts';

type VercelRequest = IncomingMessage & { body?: unknown };
type VercelResponse = ServerResponse;

const caches = globalThis as unknown as { __clickitLicenseDb?: Promise<LicenseDb> };

function dbPromise(): Promise<LicenseDb> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return Promise.reject(new Error('DATABASE_URL ausente'));
  const cache = (caches.__clickitLicenseDb ??= postgresLicenseDb(url));
  cache.catch(() => { delete caches.__clickitLicenseDb; });
  return cache;
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => resolve(null));
  });
}

async function dispatch(request: { method: string; path: string; authorization: string | null; rawBody: string | null }): Promise<LicenseResponse> {
  let db: LicenseDb;
  try {
    db = await dbPromise();
  } catch {
    if (request.path === '/health') return { status: 503, json: { ok: false, database: 'error' } };
    return { status: 503, json: { ok: false, error: 'SERVICE_UNAVAILABLE' } };
  }
  const privateKey = process.env.LICENSE_PRIVATE_KEY?.trim();
  if (!privateKey) return { status: 503, json: { ok: false, error: 'SERVICE_UNAVAILABLE' } };
  const adminKey = process.env.LICENSE_ADMIN_KEY?.trim() || null;
  const handler = createLicenseHandler({ db, privateKey, adminKey });
  return handler(request);
}

/** Adapter Vercel (node:http): rota = caminho real da requisição (com prefixo /api). */
export function vercelHandler(request: VercelRequest, response: VercelResponse): void {
  let path = (request.url ?? '/').split('?')[0] ?? '/';
  if (path.startsWith('/api')) path = path === '/api' ? '/' : path.slice(4);
  const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : null;
  void readBody(request)
    .then((streamBody) => {
      const rawBody = streamBody !== null && streamBody.length > 0
        ? streamBody
        : (typeof request.body === 'string' ? request.body
          : request.body === undefined || request.body === null ? null : JSON.stringify(request.body));
      return dispatch({ method: request.method ?? 'GET', path, authorization, rawBody });
    })
    .then(({ status, json }) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(json));
    })
    .catch((error) => {
      if (process.env.VERCEL) console.error(`[adapter] dispatch error:`, error instanceof Error ? error.stack ?? error.message : String(error));
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, error: 'SERVER_ERROR' }));
    });
}
