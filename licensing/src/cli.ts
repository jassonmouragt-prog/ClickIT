import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { hashLicenseKey, generateLicenseKey } from '../../src/licensing/keys.ts';
import { sqliteLicenseDb } from './db.ts';

const dbFile = process.env.CLICKIT_LICENSE_SQLITE ?? 'licensing/license.sqlite';

function usage(): void {
  console.log(`Uso:
  license:create --name "Cliente" [--email a@b.co] [--maxDevices 2] [--expiresAt ISO]
  license:list
  license:revoke <licenseId>
  license:unrevoke <licenseId>
  license:devices [licenseId]
  license:keys                 Mostra o par de chaves atual (dev) usado pela API local.
`);
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
  const db = sqliteLicenseDb(dbFile);
  try {
    if (command === 'create') {
      const arg = (name: string): string => { const at = rest.indexOf('--' + name); return at >= 0 && rest[at + 1] ? rest[at + 1]! : ''; };
      const customerName = arg('name');
      if (!customerName) { console.error('Informe --name "Nome do cliente".'); process.exit(1); }
      const email = arg('email');
      const maxDevices = Number(arg('maxDevices') || '2');
      const expiresRaw = arg('expiresAt') || '';
      const id = crypto.randomUUID();
      const key = generateLicenseKey();
      const createdAt = new Date().toISOString();
      const expiresAt = expiresRaw && !Number.isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw).toISOString() : null;
      const license = await db.create({ id, keyHash: hashLicenseKey(key), customerName, customerEmail: email, plan: 'LIFETIME', maxDevices, createdAt, expiresAt });
      console.log(`Licença criada: ${license.id}`);
      console.log(`Chave única (guarde agora): ${key}`);
      console.log(`Cliente: ${customerName} | email: ${email || '-'} | devices: ${maxDevices} | expira: ${expiresAt ?? 'nunca'}`);
    } else if (command === 'list') {
      for (const license of await db.list()) console.log(`${license.status.padEnd(7)} ${license.id} ${license.customerName} (${license.customerEmail}) devices=${license.maxDevices} criada=${license.createdAt}`);
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
    } else return void usage();
  } finally {
    await db.close();
  }
}

void main();