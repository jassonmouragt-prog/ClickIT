import { DatabaseSync } from 'node:sqlite';
import type { ActivationRow, LicenseDb, LicenseRow, TrialRow } from './types.ts';

const SQL = {
  create: 'INSERT INTO licenses(id,key_hash,customer_name,customer_email,status,plan,max_devices,created_at,expires_at,revoked_at,order_nsu,purchased_version,updates_included,updates_used) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  byHash: 'SELECT * FROM licenses WHERE key_hash=?',
  byId: 'SELECT * FROM licenses WHERE id=?',
  byOrderNsu: 'SELECT * FROM licenses WHERE order_nsu=?',
  list: 'SELECT * FROM licenses ORDER BY created_at DESC',
  setStatus: 'UPDATE licenses SET status=?,revoked_at=? WHERE id=?',
  activation: 'SELECT * FROM license_activations WHERE license_id=? AND device_id=?',
  activations: 'SELECT * FROM license_activations WHERE license_id=? ORDER BY activated_at DESC',
  activeCount: "SELECT COUNT(*) n FROM license_activations WHERE license_id=? AND revoked_at IS NULL",
  addActivation: 'INSERT INTO license_activations(id,license_id,device_id,device_name,app_version,activated_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',
  deactivate: 'DELETE FROM license_activations WHERE license_id=? AND device_id=?',
  touch: 'UPDATE license_activations SET last_seen_at=?,app_version=? WHERE license_id=? AND device_id=? AND revoked_at IS NULL'
};

/** Colunas comerciais adicionadas em licenças já existentes. */
const COMMERCIAL_COLUMNS: Record<string, string> = {
  order_nsu: 'TEXT',
  purchased_version: 'TEXT',
  updates_included: 'INTEGER',
  updates_used: 'INTEGER',
};

type SqliteRow = Record<string, string | number | null>;

function licenseRow(row: SqliteRow): LicenseRow {
  const nullable = (key: string): string | null => (row[key] === null || row[key] === undefined ? null : String(row[key]));
  const nullableNumber = (key: string): number | null => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
  return {
    id: String(row.id), keyHash: String(row.key_hash), customerName: String(row.customer_name), customerEmail: String(row.customer_email),
    status: String(row.status) as LicenseRow['status'], plan: String(row.plan), maxDevices: Number(row.max_devices),
    createdAt: String(row.created_at), expiresAt: row.expires_at === null || row.expires_at === undefined ? null : String(row.expires_at), revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at),
    orderId: nullable('order_nsu'), purchasedVersion: nullable('purchased_version'),
    updatesIncluded: nullableNumber('updates_included'), updatesUsed: nullableNumber('updates_used')
  };
}

function activationRow(row: SqliteRow): ActivationRow {
  return {
    id: String(row.id), licenseId: String(row.license_id), deviceId: String(row.device_id), deviceName: String(row.device_name),
    appVersion: String(row.app_version), activatedAt: String(row.activated_at), lastSeenAt: String(row.last_seen_at), revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at)
  };
}
function trialRow(row: SqliteRow): TrialRow {
  return { id: String(row.id), deviceIdHash: String(row.device_id_hash), startedAt: String(row.started_at), expiresAt: String(row.expires_at), consumedAt: String(row.consumed_at), status: String(row.status) as TrialRow['status'], appVersion: String(row.app_version), createdAt: String(row.created_at), convertedAt: row.converted_at === null ? null : String(row.converted_at) };
}

function logGranted(db: DatabaseSync): void {
  db.exec(`PRAGMA foreign_keys=ON;`);
}

export function sqliteLicenseDb(file: string): LicenseDb {
  const db = new DatabaseSync(file);
  logGranted(db);
  db.exec(`CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL, customer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', plan TEXT NOT NULL DEFAULT 'LIFETIME', max_devices INTEGER NOT NULL DEFAULT 2,
    created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT,
    order_nsu TEXT, purchased_version TEXT, updates_included INTEGER, updates_used INTEGER
  ); CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_order_nsu ON licenses(order_nsu) WHERE order_nsu IS NOT NULL;
  CREATE TABLE IF NOT EXISTS license_activations (
    id TEXT PRIMARY KEY, license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE, device_id TEXT NOT NULL,
    device_name TEXT NOT NULL, app_version TEXT NOT NULL, activated_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, revoked_at TEXT,
    UNIQUE(license_id, device_id)
  ); CREATE INDEX IF NOT EXISTS idx_la_license ON license_activations(license_id);
  CREATE TABLE IF NOT EXISTS trial_activations (
    id TEXT PRIMARY KEY, device_id_hash TEXT NOT NULL UNIQUE, started_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, consumed_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ACTIVE','EXPIRED','CONVERTED')),
    app_version TEXT NOT NULL, created_at TEXT NOT NULL, converted_at TEXT
  );`);
  const existing = new Set((db.prepare('PRAGMA table_info(licenses)').all() as SqliteRow[]).map(row => String(row.name)));
  for (const [name, type] of Object.entries(COMMERCIAL_COLUMNS)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE licenses ADD COLUMN ${name} ${type};`);
  }
  const all = (sql: string, ...params: (string | number)[]) => db.prepare(sql).all(...params) as unknown as SqliteRow[];
  const get = (sql: string, ...params: (string | number)[]) => db.prepare(sql).get(...params) as unknown as SqliteRow | undefined;
  const run = (sql: string, ...params: (string | number | null)[]) => { db.prepare(sql).run(...params); };
  return {
    close: async () => { db.close(); },
    create: async input => {
      run(SQL.create, input.id, input.keyHash, input.customerName, input.customerEmail, 'ACTIVE', input.plan, input.maxDevices, input.createdAt, input.expiresAt, null,
        input.orderId ?? null, input.purchasedVersion ?? null, input.updatesIncluded ?? null, input.updatesUsed ?? null);
      return licenseRow(get(SQL.byId, input.id)!);
    },
    byKeyHash: async hash => { const row = get(SQL.byHash, hash); return row ? licenseRow(row) : null; },
    byId: async id => { const row = get(SQL.byId, id); return row ? licenseRow(row) : null; },
    byOrderNsu: async orderNsu => { const row = get(SQL.byOrderNsu, orderNsu); return row ? licenseRow(row) : null; },
    ping: async () => { db.prepare('SELECT 1').get(); return true; },
    list: async () => all(SQL.list).map(licenseRow),
    setStatus: async (id, status, at) => run(SQL.setStatus, status, status === 'REVOKED' ? at : null, id),
    activation: async (licenseId, deviceId) => { const row = get(SQL.activation, licenseId, deviceId); return row ? activationRow(row) : null; },
    activations: async licenseId => all(SQL.activations, licenseId).map(activationRow),
    activeCount: async licenseId => Number(get(SQL.activeCount, licenseId)?.n ?? 0),
    addActivation: async (licenseId, deviceId, deviceName, appVersion, at) => {
      const id = crypto.randomUUID();
      run(SQL.addActivation, id, licenseId, deviceId, deviceName, appVersion, at, at);
      return { id, licenseId, deviceId, deviceName, appVersion, activatedAt: at, lastSeenAt: at, revokedAt: null };
    },
    deactivate: async (licenseId, deviceId) => run(SQL.deactivate, licenseId, deviceId),
    touch: async (licenseId, deviceId, appVersion, at) => run(SQL.touch, at, appVersion, licenseId, deviceId),
    startTrial: async input => {
      const result = db.prepare('INSERT OR IGNORE INTO trial_activations VALUES(?,?,?,?,?,?,?,?,?)').run(input.id, input.deviceIdHash, input.startedAt, input.expiresAt, input.startedAt, 'ACTIVE', input.appVersion, input.startedAt, null);
      return result.changes === 1 ? trialRow(get('SELECT * FROM trial_activations WHERE id=?', input.id)!) : null;
    },
    trialByDeviceHash: async hash => { const row = get('SELECT * FROM trial_activations WHERE device_id_hash=?', hash); return row ? trialRow(row) : null; },
    listTrials: async now => {
      run("UPDATE trial_activations SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at<=?", now);
      return all('SELECT * FROM trial_activations ORDER BY started_at DESC').map(trialRow);
    },
    convertTrial: async (hash, at) => run("UPDATE trial_activations SET status='CONVERTED',converted_at=? WHERE device_id_hash=? AND status<>'CONVERTED'", at, hash),
    hasCommercialActivation: async deviceId => !!get('SELECT 1 FROM license_activations WHERE device_id=? LIMIT 1', deviceId)
  };
}

type PgRow = Record<string, unknown>;

export async function postgresLicenseDb(connectionString: string): Promise<LicenseDb> {
  const { Pool } = await import('pg') as { Pool: new (options: { connectionString: string }) => import('pg').Pool };
  const pool = new Pool({ connectionString });
  await pool.query(`CREATE TABLE IF NOT EXISTS licenses (
    id uuid PRIMARY KEY, key_hash text NOT NULL UNIQUE, customer_name text NOT NULL, customer_email text NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')), plan text NOT NULL DEFAULT 'LIFETIME',
    max_devices integer NOT NULL DEFAULT 2, created_at timestamptz NOT NULL, expires_at timestamptz, revoked_at timestamptz,
    order_nsu text, purchased_version text, updates_included integer, updates_used integer
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS license_activations (
    id uuid PRIMARY KEY, license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE, device_id text NOT NULL,
    device_name text NOT NULL, app_version text NOT NULL, activated_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
    revoked_at timestamptz, UNIQUE(license_id, device_id)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_la_license ON license_activations(license_id)');
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_order_nsu ON licenses(order_nsu) WHERE order_nsu IS NOT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trial_activations (
    id uuid PRIMARY KEY, device_id_hash text NOT NULL UNIQUE, started_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL, consumed_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','CONVERTED')),
    app_version text NOT NULL, created_at timestamptz NOT NULL, converted_at timestamptz
  )`);
  for (const [name, type] of Object.entries(COMMERCIAL_COLUMNS)) {
    try {
      await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    } catch {
      // Tabela ainda não existe neste banco; criada pelo deploy.
    }
  }
  const iso = (value: string | Date | null): string | null => value === null ? null : new Date(value).toISOString();
  const toLicense = (row: PgRow): LicenseRow => ({
    id: String(row.id), keyHash: String(row.key_hash), customerName: String(row.customer_name), customerEmail: String(row.customer_email),
    status: String(row.status) as LicenseRow['status'], plan: String(row.plan), maxDevices: Number(row.max_devices),
    createdAt: iso(row.created_at as string)!, expiresAt: iso(row.expires_at as string | null), revokedAt: iso(row.revoked_at as string | null),
    orderId: row.order_nsu === null || row.order_nsu === undefined ? null : String(row.order_nsu),
    purchasedVersion: row.purchased_version === null || row.purchased_version === undefined ? null : String(row.purchased_version),
    updatesIncluded: row.updates_included === null || row.updates_included === undefined ? null : Number(row.updates_included),
    updatesUsed: row.updates_used === null || row.updates_used === undefined ? null : Number(row.updates_used)
  });
  const toActivation = (row: PgRow): ActivationRow => ({
    id: String(row.id), licenseId: String(row.license_id), deviceId: String(row.device_id), deviceName: String(row.device_name),
    appVersion: String(row.app_version), activatedAt: iso(row.activated_at as string)!, lastSeenAt: iso(row.last_seen_at as string)!, revokedAt: iso(row.revoked_at as string | null)
  });
  const toTrial = (row: PgRow): TrialRow => ({ id: String(row.id), deviceIdHash: String(row.device_id_hash), startedAt: iso(row.started_at as string)!, expiresAt: iso(row.expires_at as string)!, consumedAt: iso(row.consumed_at as string)!, status: String(row.status) as TrialRow['status'], appVersion: String(row.app_version), createdAt: iso(row.created_at as string)!, convertedAt: iso(row.converted_at as string | null) });
  return {
    close: async () => { await pool.end(); },
    create: async input => {
      await pool.query('INSERT INTO licenses(id,key_hash,customer_name,customer_email,status,plan,max_devices,created_at,expires_at,revoked_at,order_nsu,purchased_version,updates_included,updates_used) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [input.id, input.keyHash, input.customerName, input.customerEmail, 'ACTIVE', input.plan, input.maxDevices, input.createdAt, input.expiresAt, null, input.orderId ?? null, input.purchasedVersion ?? null, input.updatesIncluded ?? null, input.updatesUsed ?? null]);
      const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE id=$1', [input.id]);
      return toLicense(result.rows[0]!);
    },
    byKeyHash: async hash => { const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE key_hash=$1', [hash]); return result.rows[0] ? toLicense(result.rows[0]) : null; },
    byId: async id => { const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE id=$1', [id]); return result.rows[0] ? toLicense(result.rows[0]) : null; },
    byOrderNsu: async orderNsu => { const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE order_nsu=$1', [orderNsu]); return result.rows[0] ? toLicense(result.rows[0]) : null; },
    ping: async () => { await pool.query('SELECT 1'); return true; },
    list: async () => (await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses ORDER BY created_at DESC')).rows.map(toLicense),
    setStatus: async (id, status, at) => { await pool.query('UPDATE licenses SET status=$1,revoked_at=$2 WHERE id=$3', [status, status === 'REVOKED' ? at : null, id]); },
    activation: async (licenseId, deviceId) => { const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM license_activations WHERE license_id=$1 AND device_id=$2', [licenseId, deviceId]); return result.rows[0] ? toActivation(result.rows[0]) : null; },
    activations: async licenseId => (await pool.query<{ [key: string]: unknown }>('SELECT * FROM license_activations WHERE license_id=$1 ORDER BY activated_at DESC', [licenseId])).rows.map(toActivation),
    activeCount: async licenseId => Number(((await pool.query<{ n: string | number }>('SELECT COUNT(*) AS n FROM license_activations WHERE license_id=$1 AND revoked_at IS NULL', [licenseId])).rows[0]?.n) ?? 0),
    addActivation: async (licenseId, deviceId, deviceName, appVersion, at) => {
      const id = crypto.randomUUID();
      await pool.query('INSERT INTO license_activations(id,license_id,device_id,device_name,app_version,activated_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$6,$6)', [id, licenseId, deviceId, deviceName, appVersion, at]);
      return { id, licenseId, deviceId, deviceName, appVersion, activatedAt: at, lastSeenAt: at, revokedAt: null };
    },
    deactivate: async (licenseId, deviceId) => { await pool.query('DELETE FROM license_activations WHERE license_id=$1 AND device_id=$2', [licenseId, deviceId]); },
    touch: async (licenseId, deviceId, appVersion, at) => { await pool.query('UPDATE license_activations SET last_seen_at=$1,app_version=$2 WHERE license_id=$3 AND device_id=$4 AND revoked_at IS NULL', [at, appVersion, licenseId, deviceId]); },
    startTrial: async input => {
      const result = await pool.query<PgRow>("INSERT INTO trial_activations(id,device_id_hash,started_at,expires_at,consumed_at,status,app_version,created_at) VALUES($1,$2,$3,$4,$3,'ACTIVE',$5,$3) ON CONFLICT(device_id_hash) DO NOTHING RETURNING *", [input.id, input.deviceIdHash, input.startedAt, input.expiresAt, input.appVersion]);
      return result.rows[0] ? toTrial(result.rows[0]) : null;
    },
    trialByDeviceHash: async hash => { const result = await pool.query<PgRow>('SELECT * FROM trial_activations WHERE device_id_hash=$1', [hash]); return result.rows[0] ? toTrial(result.rows[0]) : null; },
    listTrials: async now => {
      await pool.query("UPDATE trial_activations SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at<=$1", [now]);
      return (await pool.query<PgRow>('SELECT * FROM trial_activations ORDER BY started_at DESC')).rows.map(toTrial);
    },
    convertTrial: async (hash, at) => { await pool.query("UPDATE trial_activations SET status='CONVERTED',converted_at=$1 WHERE device_id_hash=$2 AND status<>'CONVERTED'", [at, hash]); },
    hasCommercialActivation: async deviceId => (await pool.query('SELECT 1 FROM license_activations WHERE device_id=$1 LIMIT 1', [deviceId])).rowCount !== 0
  };
}
