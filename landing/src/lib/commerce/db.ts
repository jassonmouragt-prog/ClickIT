import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { NewOrderInput, OrderRecord, PaymentClaim } from './types.ts';
import { CommerceError } from './types.ts';
import type { OrderStatus } from '../../config/commerce.ts';

const COLUMNS: Record<string, string> = {
  id: 'TEXT PRIMARY KEY',
  order_nsu: 'TEXT NOT NULL UNIQUE',
  public_token: 'TEXT NOT NULL UNIQUE',
  product_id: 'TEXT NOT NULL',
  customer_name: 'TEXT NOT NULL',
  customer_email: 'TEXT NOT NULL',
  customer_phone: 'TEXT',
  amount_expected: 'INTEGER NOT NULL',
  currency: 'TEXT NOT NULL',
  status: "TEXT NOT NULL CHECK(status IN ('PENDING','PAID','LICENSE_CREATED','COMPLETED','FAILED','CANCELLED'))",
  checkout_url: 'TEXT',
  infinitepay_slug: 'TEXT',
  transaction_nsu: 'TEXT',
  capture_method: 'TEXT',
  paid_amount: 'INTEGER',
  receipt_url: 'TEXT',
  license_id: 'TEXT',
  license_key: 'TEXT',
  license_delivered_at: 'TEXT',
  created_at: 'TEXT NOT NULL',
  paid_at: 'TEXT',
  last_error: 'TEXT',
};

type SqlRow = Record<string, unknown>;

/** Converte timestamptz do Postgres (Date) e TEXT do SQLite para ISO string. */
function textVal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toOrder(row: SqlRow): OrderRecord {
  const text = (key: string): string | null => textVal(row[key]);
  const num = (key: string): number | null => {
    const value = row[key];
    return value === null || value === undefined ? null : Number(value);
  };
  return {
    id: String(row.id),
    orderNsu: String(row.order_nsu),
    publicToken: String(row.public_token),
    productId: String(row.product_id),
    customerName: String(row.customer_name),
    customerEmail: String(row.customer_email),
    customerPhone: text('customer_phone'),
    amountExpected: Number(row.amount_expected),
    currency: String(row.currency),
    status: String(row.status) as OrderStatus,
    checkoutUrl: text('checkout_url'),
    infinitepaySlug: text('infinitepay_slug'),
    transactionNsu: text('transaction_nsu'),
    captureMethod: text('capture_method'),
    paidAmount: num('paid_amount'),
    receiptUrl: text('receipt_url'),
    licenseId: text('license_id'),
    licenseKey: text('license_key'),
    licenseDeliveredAt: text('license_delivered_at'),
    createdAt: String(textVal(row.created_at)),
    paidAt: text('paid_at'),
    lastError: text('last_error'),
  };
}

/** `CLICKIT-ORDER-<18 hex>` — nunca é sequencial nem adivinhável. */
export function generateOrderNsu(): string {
  return `CLICKIT-ORDER-${randomBytes(9).toString('hex').toUpperCase()}`;
}

export function generatePublicToken(): string {
  return randomBytes(16).toString('hex');
}

export interface OrdersStore {
  insert(input: NewOrderInput): Promise<OrderRecord>;
  byOrderNsu(orderNsu: string): Promise<OrderRecord | null>;
  byPublicToken(token: string): Promise<OrderRecord | null>;
  byTransactionNsu(transactionNsu: string): Promise<OrderRecord | null>;
  byLocator(locator: string): Promise<OrderRecord | null>;
  attachCheckout(orderNsu: string, info: { checkoutUrl: string; slug: string | null }): Promise<OrderRecord>;
  claimPaid(orderNsu: string, claim: PaymentClaim): Promise<{ claimed: boolean; order: OrderRecord }>;
  attachLicense(orderNsu: string, info: { licenseId: string; licenseKey: string }): Promise<{ claimed: boolean; order: OrderRecord }>;
  markDelivered(orderNsu: string): Promise<OrderRecord>;
  setState(orderNsu: string, status: OrderStatus, error?: string): Promise<OrderRecord>;
  list(limit?: number): Promise<OrderRecord[]>;
  close(): Promise<void>;
}

/** Detalhe de violação de índice único nos dois motores. */
function isUniqueNsuError(error: unknown): boolean {
  const e = error as { code?: string; errcode?: number };
  return e?.code === '23505' || e?.errcode === 2067 || e?.errcode === 2068;
}

/* ===================================================================== */
/* SQLite (dev/testes)                                                   */
/* ===================================================================== */

function ensureSqliteSchema(db: DatabaseSync): void {
  const definitions = Object.entries(COLUMNS)
    .map(([name, type]) => `${name} ${type}`)
    .join(', ');
  db.exec(`CREATE TABLE IF NOT EXISTS orders (${definitions});`);

  const existing = new Set(
    (db.prepare('PRAGMA table_info(orders)').all() as SqlRow[]).map(row => String(row.name)),
  );
  for (const [name, type] of Object.entries(COLUMNS)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type};`);
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_transaction_nsu ON orders(transaction_nsu);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);');
  db.exec('PRAGMA journal_mode=WAL;');
}

/** Cria o pedido; em colisão de order_nsu (improvável) regenera e tenta de novo. */
function insertWithRetry(db: DatabaseSync, input: NewOrderInput): OrderRecord {
  const sql =
    'INSERT INTO orders(id,order_nsu,public_token,product_id,customer_name,customer_email,customer_phone,amount_expected,currency,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,\'PENDING\',?)';
  let nsu = input.orderNsu;
  let token = input.publicToken;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      db.prepare(sql).run(
        input.id,
        nsu,
        token,
        input.productId,
        input.customerName,
        input.customerEmail,
        input.customerPhone,
        input.amountExpected,
        input.currency,
        input.createdAt,
      );
      return sqliteGetOrThrow(db, nsu);
    } catch (error) {
      lastError = error;
      nsu = generateOrderNsu();
      token = generatePublicToken();
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Não foi possível criar o pedido.');
}

function sqliteGet(db: DatabaseSync, orderNsu: string): OrderRecord | null {
  const row = db.prepare('SELECT * FROM orders WHERE order_nsu=?').get(orderNsu) as SqlRow | undefined;
  return row ? toOrder(row) : null;
}

function sqliteGetOrThrow(db: DatabaseSync, orderNsu: string): OrderRecord {
  const order = sqliteGet(db, orderNsu);
  if (!order) throw new CommerceError('ORDER_NOT_FOUND', 'Pedido não encontrado.');
  return order;
}

export async function sqliteOrdersDb(file: string): Promise<OrdersStore> {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  ensureSqliteSchema(db);

  const update = async (orderNsu: string, sql: string, ...params: (string | number | null)[]): Promise<OrderRecord> => {
    db.prepare(sql).run(...params, orderNsu);
    return sqliteGetOrThrow(db, orderNsu);
  };

  return {
    insert: async input => insertWithRetry(db, input),
    byOrderNsu: async orderNsu => sqliteGet(db, orderNsu),
    byPublicToken: async token => {
      const row = db.prepare('SELECT * FROM orders WHERE public_token=?').get(token) as SqlRow | undefined;
      return row ? toOrder(row) : null;
    },
    byTransactionNsu: async transactionNsu => {
      const row = db.prepare('SELECT * FROM orders WHERE transaction_nsu=?').get(transactionNsu) as SqlRow | undefined;
      return row ? toOrder(row) : null;
    },
    byLocator: async locator => {
      const row = db
        .prepare('SELECT * FROM orders WHERE public_token=? OR order_nsu=? LIMIT 1')
        .get(locator, locator) as SqlRow | undefined;
      return row ? toOrder(row) : null;
    },
    attachCheckout: (orderNsu, info) =>
      update(orderNsu, 'UPDATE orders SET checkout_url=?,infinitepay_slug=? WHERE order_nsu=?', info.checkoutUrl, info.slug),
    claimPaid: async (orderNsu, claim) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const order = sqliteGetOrThrow(db, orderNsu);
        if (order.status === 'PAID' || order.status === 'LICENSE_CREATED' || order.status === 'COMPLETED') {
          db.exec('COMMIT');
          return { claimed: false, order };
        }
        const other = db
          .prepare('SELECT order_nsu FROM orders WHERE transaction_nsu=? AND order_nsu<>?')
          .get(claim.transactionNsu, orderNsu) as SqlRow | undefined;
        if (other) throw new CommerceError('TRANSACTION_CONFLICT', 'transaction_nsu já usado em outro pedido.');
        const result = db
          .prepare(
            "UPDATE orders SET status='PAID',transaction_nsu=?,paid_amount=?,capture_method=?,receipt_url=?,paid_at=?,last_error=NULL WHERE order_nsu=? AND status IN ('PENDING','FAILED')",
          )
          .run(
            claim.transactionNsu,
            claim.paidAmount,
            claim.captureMethod,
            claim.receiptUrl,
            claim.paidAt,
            orderNsu,
          );
        db.exec('COMMIT');
        return { claimed: Number(result.changes) === 1, order: sqliteGetOrThrow(db, orderNsu) };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    attachLicense: async (orderNsu, info) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const order = sqliteGetOrThrow(db, orderNsu);
        if (order.status === 'LICENSE_CREATED' || order.status === 'COMPLETED') {
          db.exec('COMMIT');
          return { claimed: false, order };
        }
        if (order.status !== 'PAID') {
          throw new CommerceError('PAYMENT_NOT_CONFIRMED', 'Pagamento não confirmado.');
        }
        db.prepare("UPDATE orders SET status='LICENSE_CREATED',license_id=?,license_key=? WHERE order_nsu=? AND status='PAID'").run(
          info.licenseId,
          info.licenseKey,
          orderNsu,
        );
        db.exec('COMMIT');
        return { claimed: true, order: sqliteGetOrThrow(db, orderNsu) };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    markDelivered: async orderNsu => {
      const order = sqliteGetOrThrow(db, orderNsu);
      if (order.status === 'LICENSE_CREATED') {
        return update(
          orderNsu,
          "UPDATE orders SET status='COMPLETED',license_delivered_at=? WHERE order_nsu=?",
          new Date().toISOString(),
        );
      }
      return order;
    },
    setState: (orderNsu, status, error) =>
      update(orderNsu, 'UPDATE orders SET status=?,last_error=? WHERE order_nsu=?', status, error ?? null),
    list: async (limit = 50) =>
      (
        db
          .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?')
          .all(Math.max(1, Math.min(limit, 500))) as SqlRow[]
      ).map(toOrder),
    close: async () => {
      db.close();
    },
  };
}

/* ===================================================================== */
/* Postgres (produção — Neon/Vercel)                                     */
/* ===================================================================== */

export async function postgresOrdersDb(connectionString: string): Promise<OrdersStore> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, max: 2 });
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY, order_nsu text NOT NULL UNIQUE, public_token text NOT NULL UNIQUE, product_id text NOT NULL,
    customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text,
    amount_expected integer NOT NULL, currency text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','LICENSE_CREATED','COMPLETED','FAILED','CANCELLED')),
    checkout_url text, infinitepay_slug text, transaction_nsu text, capture_method text, paid_amount integer,
    receipt_url text, license_id text, license_key text, license_delivered_at text,
    created_at timestamptz NOT NULL, paid_at timestamptz, last_error text
  )`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_transaction_nsu ON orders(transaction_nsu) WHERE transaction_nsu IS NOT NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)');

  const get = async (orderNsu: string): Promise<OrderRecord | null> => {
    const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM orders WHERE order_nsu=$1', [orderNsu]);
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  };
  const getOrThrow = async (orderNsu: string): Promise<OrderRecord> => {
    const order = await get(orderNsu);
    if (!order) throw new CommerceError('ORDER_NOT_FOUND', 'Pedido não encontrado.');
    return order;
  };

  return {
    insert: async input => {
      const sql =
        'INSERT INTO orders(id,order_nsu,public_token,product_id,customer_name,customer_email,customer_phone,amount_expected,currency,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
      let nsu = input.orderNsu;
      let token = input.publicToken;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await pool.query(sql, [input.id, nsu, token, input.productId, input.customerName, input.customerEmail, input.customerPhone, input.amountExpected, input.currency, 'PENDING', input.createdAt]);
          return (await getOrThrow(nsu));
        } catch (error) {
          if (!isUniqueNsuError(error)) throw error;
          lastError = error;
          nsu = generateOrderNsu();
          token = generatePublicToken();
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Não foi possível criar o pedido.');
    },
    byOrderNsu: get,
    byPublicToken: async token => {
      const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM orders WHERE public_token=$1', [token]);
      return result.rows[0] ? toOrder(result.rows[0]) : null;
    },
    byTransactionNsu: async transactionNsu => {
      const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM orders WHERE transaction_nsu=$1', [transactionNsu]);
      return result.rows[0] ? toOrder(result.rows[0]) : null;
    },
    byLocator: async locator => {
      const result = await pool.query<{ [key: string]: unknown }>('SELECT * FROM orders WHERE public_token=$1 OR order_nsu=$2 LIMIT 1', [locator, locator]);
      return result.rows[0] ? toOrder(result.rows[0]) : null;
    },
    attachCheckout: async (orderNsu, info) => {
      await pool.query('UPDATE orders SET checkout_url=$1,infinitepay_slug=$2 WHERE order_nsu=$3', [info.checkoutUrl, info.slug, orderNsu]);
      return getOrThrow(orderNsu);
    },
    claimPaid: async (orderNsu, claim) => {
      const order = await getOrThrow(orderNsu);
      if (order.status === 'PAID' || order.status === 'LICENSE_CREATED' || order.status === 'COMPLETED') {
        return { claimed: false, order };
      }
      const other = await pool.query('SELECT order_nsu FROM orders WHERE transaction_nsu=$1 AND order_nsu<>$2 LIMIT 1', [claim.transactionNsu, orderNsu]);
      if (other.rowCount !== 0) throw new CommerceError('TRANSACTION_CONFLICT', 'transaction_nsu já usado em outro pedido.');
      const result = await pool.query<{ [key: string]: unknown }>(
        "UPDATE orders SET status='PAID',transaction_nsu=$1,paid_amount=$2,capture_method=$3,receipt_url=$4,paid_at=$5,last_error=NULL WHERE order_nsu=$6 AND status IN ('PENDING','FAILED') RETURNING *",
        [claim.transactionNsu, claim.paidAmount, claim.captureMethod, claim.receiptUrl, claim.paidAt, orderNsu],
      );
      return { claimed: result.rowCount === 1, order: await getOrThrow(orderNsu) };
    },
    attachLicense: async (orderNsu, info) => {
      const order = await getOrThrow(orderNsu);
      if (order.status === 'LICENSE_CREATED' || order.status === 'COMPLETED') {
        return { claimed: false, order };
      }
      if (order.status !== 'PAID') {
        throw new CommerceError('PAYMENT_NOT_CONFIRMED', 'Pagamento não confirmado.');
      }
      const result = await pool.query<{ [key: string]: unknown }>(
        "UPDATE orders SET status='LICENSE_CREATED',license_id=$1,license_key=$2 WHERE order_nsu=$3 AND status='PAID' RETURNING *",
        [info.licenseId, info.licenseKey, orderNsu],
      );
      return { claimed: result.rowCount === 1, order: await getOrThrow(orderNsu) };
    },
    markDelivered: async orderNsu => {
      const order = await getOrThrow(orderNsu);
      if (order.status === 'LICENSE_CREATED') {
        await pool.query("UPDATE orders SET status='COMPLETED',license_delivered_at=$1 WHERE order_nsu=$2 AND status='LICENSE_CREATED'", [new Date().toISOString(), orderNsu]);
        return getOrThrow(orderNsu);
      }
      return order;
    },
    setState: async (orderNsu, status, error) => {
      await pool.query('UPDATE orders SET status=$1,last_error=$2 WHERE order_nsu=$3', [status, error ?? null, orderNsu]);
      return getOrThrow(orderNsu);
    },
    list: async (limit = 50) =>
      (await pool.query<{ [key: string]: unknown }>('SELECT * FROM orders ORDER BY created_at DESC LIMIT $1', [Math.max(1, Math.min(limit, 500))])).rows.map(toOrder),
    close: async () => {
      await pool.end();
    },
  };
}

/* ===================================================================== */
/* Seleção de store                                                      */
/* ===================================================================== */

type StoreFactory = () => Promise<OrdersStore>;

/** Instância única por engine — route handlers reutilizam a conexão/lambda. */
const caches = globalThis as unknown as { __clickitOrders?: Map<string, Promise<OrdersStore>> };

export function defaultOrdersStore(): Promise<OrdersStore> {
  const isSqlite = !process.env.DATABASE_URL;
  const cacheKey = isSqlite ? process.env.ORDERS_SQLITE ?? 'data/orders.sqlite' : 'postgres';
  const cache = (caches.__clickitOrders ??= new Map());
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const factory: StoreFactory = isSqlite
    ? async () => {
        const file = (process.env.ORDERS_SQLITE ?? 'data/orders.sqlite').trim() || 'data/orders.sqlite';
        try {
          return await sqliteOrdersDb(file);
        } catch (error) {
          // FS somente leitura (ex.: serverless sem DATABASE_URL): sem store não há pedido.
          throw new CommerceError(
            'STORE_UNAVAILABLE',
            `banco de pedidos indisponível: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    : async () => postgresOrdersDb(process.env.DATABASE_URL!.trim());

  const promise = factory();
  cache.set(cacheKey, promise);
  promise.catch(() => cache.delete(cacheKey));
  return promise;
}

/** True quando o store em uso é o Postgres de produção (ajuda diagnostics). */
export function isPostgresOrders(): boolean {
  return Boolean(process.env.DATABASE_URL);
}