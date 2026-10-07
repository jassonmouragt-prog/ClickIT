import { existsSync, readFileSync } from 'node:fs';
import { createLicenseServer } from './app.ts';
import { postgresLicenseDb, sqliteLicenseDb } from './db.ts';

async function privateKey(): Promise<string> {
  if (process.env.LICENSE_PRIVATE_KEY) return process.env.LICENSE_PRIVATE_KEY;
  const file = 'licensing/dev-keypair.json';
  if (existsSync(file)) {
    const pair = JSON.parse(readFileSync(file, 'utf8')) as { privateKey: string };
    if (pair.privateKey) return pair.privateKey;
  }
  throw new Error('LICENSE_PRIVATE_KEY não definida e licensing/dev-keypair.json não encontrado. Rode "npm run license:keys".');
}

const port = Number(process.env.LICENSE_PORT ?? 8085);

async function main(): Promise<void> {
  const db = process.env.DATABASE_URL ? await postgresLicenseDb(process.env.DATABASE_URL) : sqliteLicenseDb('licensing/license.sqlite');
  const server = createLicenseServer({ db, privateKey: await privateKey(), adminKey: process.env.LICENSE_ADMIN_KEY ?? null });
  server.listen(port, () => console.log(`License API ouvindo em http://127.0.0.1:${port}`));
  const shutdown = (): void => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch(error => { console.error(error); process.exit(1); });