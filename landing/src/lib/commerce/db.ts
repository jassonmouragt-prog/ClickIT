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

type SqlRow = Record<string, string | number | null>;

function toOrder(row: SqlRow): OrderRecord {
  const text = (key: string): string | null => {
    const value = row[key];
    return value === null || value === undefined ? null : String(value);
  };
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
    createdAt: String(row.created_at),
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
  insert(input: NewOrderInput): OrderRecord;
  byOrderNsu(orderNsu: string): OrderRecord | null;
  byPublicToken(token: string): OrderRecord | null;
  byTransactionNsu(transactionNsu: string): OrderRecord | null;
  byLocator(locator: string): OrderRecord | null;
  attachCheckout(orderNsu: string, info: { checkoutUrl: string; slug: string | null }): OrderRecord;
  claimPaid(orderNsu: string, claim: PaymentClaim): { claimed: boolean; order: OrderRecord };
  attachLicense(orderNsu: string, info: { licenseId: string; licenseKey: string }): { claimed: boolean; order: OrderRecord };
  markDelivered(orderNsu: string): OrderRecord;
  setState(orderNsu: string, status: OrderStatus, error?: string): OrderRecord;
  list(limit?: number): OrderRecord[];
  close(): void;
}

function ensureSchema(db: DatabaseSync): void {
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
      return getOrThrow(db, nsu);
    } catch (error) {
      lastError = error;
      nsu = generateOrderNsu();
      token = generatePublicToken();
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Não foi possível criar o pedido.');
}

function get(db: DatabaseSync, orderNsu: string): OrderRecord | null {
  const row = db.prepare('SELECT * FROM orders WHERE order_nsu=?').get(orderNsu) as SqlRow | undefined;
  return row ? toOrder(row) : null;
}

function getOrThrow(db: DatabaseSync, orderNsu: string): OrderRecord {
  const order = get(db, orderNsu);
  if (!order) throw new CommerceError('ORDER_NOT_FOUND', 'Pedido não encontrado.');
  return order;
}

export function ordersDb(file: string): OrdersStore {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  ensureSchema(db);

  const update = (orderNsu: string, sql: string, ...params: (string | number | null)[]): OrderRecord => {
    db.prepare(sql).run(...params, orderNsu);
    return getOrThrow(db, orderNsu);
  };

  return {
    insert: input => insertWithRetry(db, input),
    byOrderNsu: orderNsu => get(db, orderNsu),
    byPublicToken: token => {
      const row = db.prepare('SELECT * FROM orders WHERE public_token=?').get(token) as SqlRow | undefined;
      return row ? toOrder(row) : null;
    },
    byTransactionNsu: transactionNsu => {
      const row = db.prepare('SELECT * FROM orders WHERE transaction_nsu=?').get(transactionNsu) as SqlRow | undefined;
      return row ? toOrder(row) : null;
    },
    byLocator: locator => {
      const row = db
        .prepare('SELECT * FROM orders WHERE public_token=? OR order_nsu=? LIMIT 1')
        .get(locator, locator) as SqlRow | undefined;
      return row ? toOrder(row) : null;
    },
    attachCheckout: (orderNsu, info) =>
      update(orderNsu, 'UPDATE orders SET checkout_url=?,infinitepay_slug=? WHERE order_nsu=?', info.checkoutUrl, info.slug),
    claimPaid: (orderNsu, claim) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const order = getOrThrow(db, orderNsu);
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
        return { claimed: Number(result.changes) === 1, order: getOrThrow(db, orderNsu) };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    attachLicense: (orderNsu, info) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const order = getOrThrow(db, orderNsu);
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
        return { claimed: true, order: getOrThrow(db, orderNsu) };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    markDelivered: orderNsu => {
      const order = getOrThrow(db, orderNsu);
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
    list: (limit = 50) =>
      (
        db
          .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?')
          .all(Math.max(1, Math.min(limit, 500))) as SqlRow[]
      ).map(toOrder),
    close: () => {
      db.close();
    },
  };
}

/** Instância única por arquivo — os route handlers reutilizam a conexão. */
const caches = globalThis as unknown as { __clickitOrders?: Map<string, OrdersStore> };

export function defaultOrdersStore(): OrdersStore {
  const file = (process.env.ORDERS_SQLITE ?? 'data/orders.sqlite').trim() || 'data/orders.sqlite';
  const cache = (caches.__clickitOrders ??= new Map());
  const existing = cache.get(file);
  if (existing) return existing;
  const store = ordersDb(file);
  cache.set(file, store);
  return store;
}
