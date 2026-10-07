import { DatabaseSync } from 'node:sqlite';
import type { ActivationRow, LicenseDb, LicenseRow } from './types.ts';

const SQL = {
  create: 'INSERT INTO licenses(id,key_hash,customer_name,customer_email,status,plan,max_devices,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  byHash: 'SELECT * FROM licenses WHERE key_hash=?',
  byId: 'SELECT * FROM licenses WHERE id=?',
  list: 'SELECT * FROM licenses ORDER BY created_at DESC',
  setStatus: 'UPDATE licenses SET status=?,revoked_at=? WHERE id=?',
  activation: 'SELECT * FROM license_activations WHERE license_id=? AND device_id=?',
  activations: 'SELECT * FROM license_activations WHERE license_id=? ORDER BY activated_at DESC',
  activeCount: "SELECT COUNT(*) n FROM license_activations WHERE license_id=? AND revoked_at IS NULL",
  addActivation: 'INSERT INTO license_activations(id,license_id,device_id,device_name,app_version,activated_at,last_seen_at) VALUES(?,?,?,?,?,?,?)',
  deactivate: 'DELETE FROM license_activations WHERE license_id=? AND device_id=?',
  touch: 'UPDATE license_activations SET last_seen_at=?,app_version=? WHERE license_id=? AND device_id=? AND revoked_at IS NULL'
};

type SqliteRow = Record<string, string | number | null>;

function licenseRow(row: SqliteRow): LicenseRow {
  return {
    id: String(row.id), keyHash: String(row.key_hash), customerName: String(row.customer_name), customerEmail: String(row.customer_email),
    status: String(row.status) as LicenseRow['status'], plan: String(row.plan), maxDevices: Number(row.max_devices),
    createdAt: String(row.created_at), expiresAt: row.expires_at === null || row.expires_at === undefined ? null : String(row.expires_at), revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at)
  };
}

function activationRow(row: SqliteRow): ActivationRow {
  return {
    id: String(row.id), licenseId: String(row.license_id), deviceId: String(row.device_id), deviceName: String(row.device_name),
    appVersion: String(row.app_version), activatedAt: String(row.activated_at), lastSeenAt: String(row.last_seen_at), revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : String(row.revoked_at)
  };
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
    created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT
  ); CREATE TABLE IF NOT EXISTS license_activations (
    id TEXT PRIMARY KEY, license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE, device_id TEXT NOT NULL,
    device_name TEXT NOT NULL, app_version TEXT NOT NULL, activated_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, revoked_at TEXT,
    UNIQUE(license_id, device_id)
  ); CREATE INDEX IF NOT EXISTS idx_la_license ON license_activations(license_id);`);
  const all = (sql: string, ...params: (string | number)[]) => db.prepare(sql).all(...params) as unknown as SqliteRow[];
  const get = (sql: string, ...params: (string | number)[]) => db.prepare(sql).get(...params) as unknown as SqliteRow | undefined;
  const run = (sql: string, ...params: (string | number | null)[]) => { db.prepare(sql).run(...params); };
  return {
    close: async () => { db.close(); },
    create: async input => {
      run(SQL.create, input.id, input.keyHash, input.customerName, input.customerEmail, 'ACTIVE', input.plan, input.maxDevices, input.createdAt, input.expiresAt, null);
      return licenseRow(get(SQL.byId, input.id)!);
    },
    byKeyHash: async hash => { const row = get(SQL.byHash, hash); return row ? licenseRow(row) : null; },
    byId: async id => { const row = get(SQL.byId, id); return row ? licenseRow(row) : null; },
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
    touch: async (licenseId, deviceId, appVersion, at) => run(SQL.touch, at, appVersion, licenseId, deviceId)
  };
}

type PgRow = Record<string, unknown>;

export async function postgresLicenseDb(connectionString: string): Promise<LicenseDb> {
  const { Pool } = await import('pg') as { Pool: new (options: { connectionString: string }) => import('pg').Pool };
  const pool = new Pool({ connectionString });
  const iso = (value: string | Date | null): string | null => value === null ? null : new Date(value).toISOString();
  const toLicense = (row: PgRow): LicenseRow => ({
    id: String(row.id), keyHash: String(row.key_hash), customerName: String(row.customer_name), customerEmail: String(row.customer_email),
    status: String(row.status) as LicenseRow['status'], plan: String(row.plan), maxDevices: Number(row.max_devices),
    createdAt: iso(row.created_at as string)!, expiresAt: iso(row.expires_at as string | null), revokedAt: iso(row.revoked_at as string | null)
  });
  const toActivation = (row: PgRow): ActivationRow => ({
    id: String(row.id), licenseId: String(row.license_id), deviceId: String(row.device_id), deviceName: String(row.device_name),
    appVersion: String(row.app_version), activatedAt: iso(row.activated_at as string)!, lastSeenAt: iso(row.last_seen_at as string)!, revokedAt: iso(row.revoked_at as string | null)
  });
  return {
    close: async () => { await pool.end(); },
    create: async input => {
      await pool.query('INSERT INTO licenses(id,key_hash,customer_name,customer_email,status,plan,max_devices,created_at,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [input.id, input.keyHash, input.customerName, input.customerEmail, 'ACTIVE', input.plan, input.maxDevices, input.createdAt, input.expiresAt, null]);
      const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE id=$1', [input.id]);
      return toLicense(result.rows[0]!);
    },
    byKeyHash: async hash => { const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE key_hash=$1', [hash]); return result.rows[0] ? toLicense(result.rows[0]) : null; },
    byId: async id => { const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM licenses WHERE id=$1', [id]); return result.rows[0] ? toLicense(result.rows[0]) : null; },
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
    touch: async (licenseId, deviceId, appVersion, at) => { await pool.query('UPDATE license_activations SET last_seen_at=$1,app_version=$2 WHERE license_id=$3 AND device_id=$4 AND revoked_at IS NULL', [at, appVersion, licenseId, deviceId]); }
  };
}