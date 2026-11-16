import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { hashLicenseKey, generateLicenseKey } from '../../src/licensing/keys.ts';
import { postgresLicenseDb, sqliteLicenseDb } from './db.ts';
import type { LicenseDb } from './types.ts';

const dbFile = process.env.CLICKIT_LICENSE_SQLITE ?? 'licensing/license.sqlite';

function usage(): void {
  console.log(`Uso:
  license:create --name "Cliente" [--email a@b.co] [--maxDevices 2] [--expiresAt ISO]
                    [--plan LIFETIME] [--purchasedVersion 0.1.3] [--updatesIncluded 3]
                    [--db postgres|sqlite]
  license:list
  license:revoke <licenseId>
  license:unrevoke <licenseId>
  license:devices [licenseId]
  license:trials
  license:keys                 Mostra o par de chaves atual (dev) usado pela API local.

  --db postgres usa DATABASE_URL (o mesmo banco da API em producao).
  Sem --db: postgres se DATABASE_URL existir, senao sqlite local.
`);
}

function flag(rest: string[], name: string): string {
  const at = rest.indexOf('--' + name);
  return at >= 0 && rest[at + 1] && !rest[at + 1]!.startsWith('--') ? rest[at + 1]! : '';
}

async function openDb(rest: string[]): Promise<LicenseDb> {
  const requested = (flag(rest, 'db') || (process.env.DATABASE_URL?.trim() ? 'postgres' : 'sqlite')).toLowerCase();
  if (requested === 'postgres') {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error('DATABASE_URL ausente. Use --db sqlite ou defina DATABASE_URL.');
    console.log('Banco: postgres (DATABASE_URL)');
    return postgresLicenseDb(url);
  }
  if (requested !== 'sqlite') throw new Error(`--db invalido: ${requested}`);
  console.log(`Banco: sqlite (${dbFile})`);
  return sqliteLicenseDb(dbFile);
}

function keys(): void {
  const file = 'licensing/dev-keypair.json';
  if (existsSync(file)) {
    const pair = JSON.parse(readFileSync(file, 'utf8')) as { publicKey?: string };
    console.log('licensing/dev-keypair.json já existe.');
    console.log('Chave PÚBLICA que deve estar embutida no desktop (src/licensing/publicKey.ts):');
    console.log(pair.publicKey ?? '(inválido)');
    return;
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(file, JSON.stringify({ publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, null, 2));
  console.log('Par de chaves gerado em licensing/dev-keypair.json (ignorado pelo git).');
  console.log('Copie a chave pública abaixo para src/licensing/publicKey.ts:');
  console.log(publicKey.export({ type: 'spki', format: 'pem' }).toString());
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) return void usage();
  if (command === 'keys') return void keys();
  const db = await openDb(rest);
  try {
    if (command === 'create') {
      const customerName = flag(rest, 'name');
      if (!customerName) { console.error('Informe --name "Nome do cliente".'); process.exit(1); }
      const email = flag(rest, 'email');
      const maxDevices = Number(flag(rest, 'maxDevices') || '2');
      const expiresRaw = flag(rest, 'expiresAt');
      const plan = flag(rest, 'plan') || 'LIFETIME';
      const purchasedVersion = flag(rest, 'purchasedVersion');
      const updatesIncludedRaw = flag(rest, 'updatesIncluded');
      const id = crypto.randomUUID();
      const key = generateLicenseKey();
      const createdAt = new Date().toISOString();
      const expiresAt = expiresRaw && !Number.isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw).toISOString() : null;
      const license = await db.create({
        id, keyHash: hashLicenseKey(key), customerName, customerEmail: email, plan, maxDevices, createdAt, expiresAt,
        orderId: null, purchasedVersion: purchasedVersion || null,
        updatesIncluded: updatesIncludedRaw ? Number(updatesIncludedRaw) : null, updatesUsed: 0
      });
      console.log(`Licença criada: ${license.id}`);
      console.log(`Chave única (guarde agora): ${key}`);
      console.log(`Cliente: ${customerName} | email: ${email || '-'} | plano: ${plan} | devices: ${maxDevices} | expira: ${expiresAt ?? 'nunca'}`);
    } else if (command === 'list') {
      for (const license of await db.list()) console.log(`${license.status.padEnd(7)} ${license.id} ${license.customerName} (${license.customerEmail || '-'}) plano=${license.plan} devices=${license.maxDevices} expira=${license.expiresAt ?? 'nunca'} criada=${license.createdAt}`);
    } else if (command === 'revoke' || command === 'unrevoke') {
      const id = rest[0];
      if (!id) return void usage();
      const license = await db.byId(id);
      if (!license) { console.error('Licença não encontrada.'); process.exit(1); }
      await db.setStatus(id, command === 'revoke' ? 'REVOKED' : 'ACTIVE', new Date().toISOString());
      console.log(`Licença ${id} → ${command === 'revoke' ? 'REVOGADA' : 'ATIVA'}.`);
    } else if (command === 'devices') {
      const id = rest[0] ?? null;
      const licenses = id ? [await db.byId(id)].filter(l => l !== null) : await db.list();
      for (const license of licenses) {
        for (const activation of await db.activations(license.id)) {
          console.log(`${activation.deviceId} ${activation.deviceName} v${activation.appVersion} ativada=${activation.activatedAt} última=${activation.lastSeenAt} revogada=${activation.revokedAt ?? 'não'}`);
        }
      }
    } else if (command === 'trials') {
      for (const trial of await db.listTrials(new Date().toISOString())) {
        console.log(`${trial.status.padEnd(9)} ${trial.id} device=${trial.deviceIdHash.slice(0, 12)} app=${trial.appVersion} iniciada=${trial.startedAt} expira=${trial.expiresAt} convertida=${trial.convertedAt ?? '-'}`);
      }
    } else return void usage();
  } finally {
    await db.close();
  }
}

void main();