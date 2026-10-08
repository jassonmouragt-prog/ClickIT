import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DEVICES,
  PLAN,
  PRODUCT_ID,
  PRODUCT_PRICE_CENTS,
  UPDATES_INCLUDED,
} from '../src/config/commerce.ts';
import { sqliteOrdersDb, type OrdersStore } from '../src/lib/commerce/db.ts';
import type { CommerceEnv } from '../src/lib/commerce/env.ts';
import type { HttpJson, HttpResponse } from '../src/lib/commerce/infinitepay.ts';
import {
  handleWebhook,
  makeDeps,
  publicStatus,
  reconcileFromRedirect,
  startOrder,
} from '../src/lib/commerce/orders.ts';
import { CommerceError } from '../src/lib/commerce/types.ts';
import { validateCustomer } from '../src/lib/commerce/validate.ts';

const env: CommerceEnv = {
  siteUrl: 'http://localhost:3000',
  apiUrl: 'https://api.checkout.test',
  handle: 'clickit',
  webhookUrl: 'http://localhost:3000/api/webhooks/infinitepay',
  redirectUrl: 'http://localhost:3000/pagamento',
  licenseApiUrl: 'http://license.test',
  licenseAdminKey: 'admin-secret',
};

const CUSTOMER = { name: 'Ana Silva', email: 'ana@exemplo.com', phone: '+5511999887766' };

interface HarnessOptions {
  paid?: boolean;
  success?: boolean;
  amount?: number;
  paidAmount?: number;
  licenseFailures?: number;
}

interface Harness {
  http: HttpJson;
  links: Record<string, unknown>[];
  checks: Record<string, unknown>[];
  licenses: Record<string, unknown>[];
}

function harness(options: HarnessOptions = {}): Harness {
  const state: Harness = { http: async () => ({ ok: false, status: 500, body: null }), links: [], checks: [], licenses: [] };
  let licenseFailures = options.licenseFailures ?? 0;
  state.http = async (url, init): Promise<HttpResponse> => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (url.endsWith('/links')) {
      state.links.push(body);
      return { ok: true, status: 200, body: { checkout_url: 'https://pay.test/abc', slug: 'slug-1' } };
    }
    if (url.endsWith('/payment_check')) {
      state.checks.push(body);
      return {
        ok: true,
        status: 200,
        body: {
          success: options.success ?? true,
          paid: options.paid ?? true,
          amount: options.amount ?? PRODUCT_PRICE_CENTS,
          paid_amount: options.paidAmount ?? PRODUCT_PRICE_CENTS,
          installments: 1,
          capture_method: 'pix',
        },
      };
    }
    if (url.endsWith('/admin/licenses')) {
      state.licenses.push({ ...body, authorization: init.headers.authorization });
      if (licenseFailures > 0) {
        licenseFailures -= 1;
        return { ok: false, status: 503, body: { error: 'down' } };
      }
      return { ok: true, status: 201, body: { licenseKey: 'CLICKIT-ABCD-1234-5678', license: { id: 'lic-1' } } };
    }
    return { ok: false, status: 404, body: { error: 'NOT_FOUND' } };
  };
  return state;
}

function newStore(): Promise<OrdersStore> {
  return sqliteOrdersDb(':memory:');
}

function webhookBody(orderNsu: string, transactionNsu: string): Record<string, unknown> {
  return {
    invoice_slug: 'slug-1',
    amount: PRODUCT_PRICE_CENTS,
    paid_amount: PRODUCT_PRICE_CENTS,
    installments: 1,
    capture_method: 'pix',
    transaction_nsu: transactionNsu,
    order_nsu: orderNsu,
    receipt_url: 'https://recibo.test/1',
    items: [{ quantity: 1, price: PRODUCT_PRICE_CENTS, description: 'ClickIT Beta - Licença vitalícia' }],
  };
}

test('oferta: 34700 centavos e campos comerciais centralizados', () => {
  assert.equal(PRODUCT_PRICE_CENTS, 34700);
  assert.equal(PRODUCT_ID, 'clickit-beta-lifetime');
  assert.equal(PLAN, 'BETA_LIFETIME');
  assert.equal(MAX_DEVICES, 2);
  assert.equal(UPDATES_INCLUDED, 3);
});

test('cliente não consegue alterar preço: o backend define 34700', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order, checkoutUrl } = await startOrder(
    { ...CUSTOMER, price: 1, amount: 99999, currency: 'USD', productId: 'outro' },
    deps,
  );
  assert.equal(order.amountExpected, 34700);
  assert.equal(order.currency, 'BRL');
  assert.equal(order.productId, PRODUCT_ID);
  assert.equal(order.status, 'PENDING');
  assert.equal(checkoutUrl, 'https://pay.test/abc');
  assert.equal(h.links.length, 1);
  assert.equal((h.links[0]!.items as { price: number }[])[0]!.price, 34700);
});

test('order_nsu é único e não sequencial', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const seen = new Set<string>();
  for (let index = 0; index < 25; index += 1) {
    const { order } = await startOrder(CUSTOMER, deps);
    assert.match(order.orderNsu, /^CLICKIT-ORDER-[0-9A-F]{18}$/);
    assert.equal(seen.has(order.orderNsu), false);
    seen.add(order.orderNsu);
    assert.equal(order.publicToken.length, 32);
  }
});

test('payload /links leva handle, itens, redirect com token, webhook e customer', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const payload = h.links[0]!;
  assert.equal(payload.handle, 'clickit');
  assert.equal(payload.order_nsu, order.orderNsu);
  assert.equal(payload.redirect_url, `${env.redirectUrl}?o=${order.publicToken}`);
  assert.equal(payload.webhook_url, env.webhookUrl);
  assert.equal(payload.description, undefined);
  const items = payload.items as { quantity: number; price: number; description: string }[];
  assert.equal(items.length, 1);
  assert.equal(items[0]!.quantity, 1);
  assert.equal(items[0]!.price, 34700);
  const customer = payload.customer as { name: string; email: string; phone_number: string };
  assert.equal(customer.email, CUSTOMER.email);
  assert.equal(customer.phone_number, CUSTOMER.phone);
});

test('checkout não configurado recusa antes de criar pedido', async () => {
  const store = await newStore();
  const deps = makeDeps({ env: { ...env, handle: '' }, store });
  await assert.rejects(() => startOrder(CUSTOMER, deps), (error: unknown) => {
    assert.ok(error instanceof CommerceError);
    assert.equal(error.code, 'NOT_CONFIGURED');
    return true;
  });
  assert.equal((await store.list()).length, 0);
});

test('redirect não aprova sozinho: /pagamento vê PENDING sem licença', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const status = await publicStatus((await store.byOrderNsu(order.orderNsu))!, `${env.siteUrl}/download`, deps);
  assert.equal(status.status, 'PENDING');
  assert.equal(status.licenseKey, undefined);
  assert.equal(h.checks.length, 0);
});

test('redirect com payment_check negativo mantém o pedido PENDING', async () => {
  const store = await newStore();
  const h = harness({ paid: false, success: false });
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const reconciled = await reconcileFromRedirect(
    (await store.byOrderNsu(order.orderNsu))!,
    { orderNsu: order.orderNsu, transactionNsu: 'TX-1', slug: 'slug-1' },
    deps,
  );
  assert.equal(reconciled.status, 'PENDING');
  assert.equal(reconciled.licenseKey, null);
  assert.equal(h.licenses.length, 0);
});

test('webhook aprovado gera licença com os metadados comerciais', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const result = await handleWebhook(webhookBody(order.orderNsu, 'TX-1'), deps);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });

  const updated = (await store.byOrderNsu(order.orderNsu))!;
  assert.equal(updated.status, 'LICENSE_CREATED');
  assert.match(updated.licenseKey ?? '', /^CLICKIT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(updated.transactionNsu, 'TX-1');
  assert.equal(updated.paidAmount, 34700);
  assert.ok(updated.paidAt);

  assert.equal(h.licenses.length, 1);
  const license = h.licenses[0]!;
  assert.equal(license.plan, 'BETA_LIFETIME');
  assert.equal(license.maxDevices, 2);
  assert.equal(license.updatesIncluded, 3);
  assert.equal(license.updatesUsed, 0);
  assert.equal(license.expiresAt, null);
  assert.equal(license.purchasedVersion, '0.1.0');
  assert.equal(license.orderId, order.orderNsu);
  assert.equal(license.customerEmail, CUSTOMER.email);
  assert.equal(license.authorization, 'Bearer admin-secret');
});

test('webhook duplicado não gera segunda licença', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const body = webhookBody(order.orderNsu, 'TX-1');
  const first = await handleWebhook(body, deps);
  const second = await handleWebhook(body, deps);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(h.licenses.length, 1);
  assert.equal((await store.byOrderNsu(order.orderNsu))!.status, 'LICENSE_CREATED');
});

test('transaction_nsu já usado em outro pedido é recusado', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const a = await startOrder(CUSTOMER, deps);
  const b = await startOrder(CUSTOMER, deps);
  await handleWebhook(webhookBody(a.order.orderNsu, 'TX-DUP'), deps);
  const result = await handleWebhook(webhookBody(b.order.orderNsu, 'TX-DUP'), deps);
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'TRANSACTION_CONFLICT');
  assert.equal((await store.byOrderNsu(b.order.orderNsu))!.status, 'PENDING');
  assert.equal(h.licenses.length, 1);
});

test('webhook para pedido inexistente não cria nada e não gera retry infinito', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const result = await handleWebhook(webhookBody('CLICKIT-ORDER-000000000000000000', 'TX-X'), deps);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: false, reason: 'ORDER_NOT_FOUND' });
  assert.equal(h.licenses.length, 0);
});

test('webhook sem order_nsu/transaction_nsu é 400', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const result = await handleWebhook({ invoice_slug: 'slug-1' }, deps);
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'INVALID_EVENT');
});

test('payment_check paid=false não gera licença', async () => {
  const store = await newStore();
  const h = harness({ paid: false, success: true });
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const result = await handleWebhook(webhookBody(order.orderNsu, 'TX-2'), deps);
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'PAYMENT_NOT_CONFIRMED');
  assert.equal((await store.byOrderNsu(order.orderNsu))!.status, 'PENDING');
  assert.equal(h.licenses.length, 0);
});

test('valor divergente não gera licença', async () => {
  const store = await newStore();
  const h = harness({ amount: 1000, paidAmount: 1000 });
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const result = await handleWebhook(webhookBody(order.orderNsu, 'TX-3'), deps);
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, 'AMOUNT_MISMATCH');
  assert.equal((await store.byOrderNsu(order.orderNsu))!.status, 'PENDING');
  assert.equal(h.licenses.length, 0);
});

test('License API indisponível: pedido fica PAID e o retry conclui', async () => {
  const store = await newStore();
  const h = harness({ licenseFailures: 1 });
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const body = webhookBody(order.orderNsu, 'TX-4');

  const first = await handleWebhook(body, deps);
  assert.equal(first.status, 400);
  assert.equal(first.body.reason, 'LICENSE_API_UNAVAILABLE');
  const mid = (await store.byOrderNsu(order.orderNsu))!;
  assert.equal(mid.status, 'PAID');
  assert.equal(mid.licenseKey, null);

  const second = await handleWebhook(body, deps);
  assert.equal(second.status, 200);
  const done = (await store.byOrderNsu(order.orderNsu))!;
  assert.equal(done.status, 'LICENSE_CREATED');
  assert.match(done.licenseKey ?? '', /^CLICKIT-/);
  assert.equal(h.licenses.length, 2);
});

test('página de status: PENDING → LICENSE_READY → COMPLETED', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const download = 'https://download.test/ClickIT-Setup.exe';

  const before = await publicStatus((await store.byOrderNsu(order.orderNsu))!, download, deps);
  assert.equal(before.status, 'PENDING');
  assert.equal(before.licenseKey, undefined);

  await handleWebhook(webhookBody(order.orderNsu, 'TX-5'), deps);
  const ready = await publicStatus((await store.byOrderNsu(order.orderNsu))!, download, deps);
  assert.equal(ready.status, 'LICENSE_CREATED');
  assert.equal(ready.licenseKey, 'CLICKIT-ABCD-1234-5678');
  assert.equal(ready.downloadUrl, download);
  assert.equal(ready.license.maxDevices, 2);
  assert.equal(ready.license.plan, 'BETA_LIFETIME');

  const after = await publicStatus((await store.byOrderNsu(order.orderNsu))!, download, deps);
  assert.equal(after.status, 'COMPLETED');
  assert.equal(after.licenseKey, 'CLICKIT-ABCD-1234-5678');
});

test('reconciliação via redirect dispara payment_check e conclui', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const result = await reconcileFromRedirect(
    (await store.byOrderNsu(order.orderNsu))!,
    { orderNsu: order.orderNsu, transactionNsu: 'TX-6', slug: 'slug-1', receiptUrl: 'https://recibo.test/6', captureMethod: 'credit_card' },
    deps,
  );
  assert.equal(result.status, 'LICENSE_CREATED');
  // payment_check é a fonte da verdade sobre a forma de pagamento.
  assert.equal(result.captureMethod, 'pix');
  assert.equal(h.checks.length, 1);
  assert.equal((h.checks[0] as { handle: string }).handle, 'clickit');
  assert.equal((h.checks[0] as { slug: string }).slug, 'slug-1');
});

test('reconciliação com order_nsu divergente é ignorada', async () => {
  const store = await newStore();
  const h = harness();
  const deps = makeDeps({ env, store, http: h.http });
  const { order } = await startOrder(CUSTOMER, deps);
  const result = await reconcileFromRedirect(
    (await store.byOrderNsu(order.orderNsu))!,
    { orderNsu: 'CLICKIT-ORDER-FFFFFFFFFFFFFFFFFFFF', transactionNsu: 'TX-7', slug: 'slug-1' },
    deps,
  );
  assert.equal(result.status, 'PENDING');
  assert.equal(h.checks.length, 0);
});

test('validação do formulário recusa nome/e-mail/WhatsApp inválidos', () => {
  const invalid: unknown[] = [
    null,
    'texto',
    { name: 'A', email: 'ana@exemplo.com', phone: '11999887766' },
    { name: 'Ana Silva', email: 'email-invalido', phone: '11999887766' },
    { name: 'Ana Silva', email: 'ana@exemplo.com', phone: '123' },
    { name: 'Ana Silva', email: 'ana@exemplo.com', phone: '' },
  ];
  for (const input of invalid) {
    assert.throws(() => validateCustomer(input), (error: unknown) => {
      assert.ok(error instanceof CommerceError);
      assert.equal(error.code, 'INVALID_CUSTOMER');
      return true;
    });
  }
  const valid = validateCustomer({ name: '  Ana   Silva ', email: ' Ana@Exemplo.com ', phone: '(11) 99988-7766' });
  assert.equal(valid.name, 'Ana Silva');
  assert.equal(valid.email, 'ana@exemplo.com');
  assert.equal(valid.phone, '11999887766');
});