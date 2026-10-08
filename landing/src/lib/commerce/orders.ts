import { randomUUID } from 'node:crypto';
import {
  ENTREGABLE,
  PRODUCT_CURRENCY,
  PRODUCT_DESCRIPTION,
  PRODUCT_ID,
  PRODUCT_PRICE_CENTS,
  type OrderStatus,
} from '../../config/commerce.ts';
import { defaultOrdersStore, generateOrderNsu, generatePublicToken, type OrdersStore } from './db.ts';
import { commerceConfigured, readCommerceEnv, type CommerceEnv } from './env.ts';
import { assertPaid, createCheckoutLink, paymentCheck, type HttpJson } from './infinitepay.ts';
import { createCommercialLicense } from './license-api.ts';
import { logEvent } from './log.ts';
import { validateCustomer } from './validate.ts';
import { CommerceError, type OrderRecord, type WebhookEvent } from './types.ts';

export interface OrderDeps {
  env: CommerceEnv;
  store: OrdersStore | Promise<OrdersStore>;
  http?: HttpJson;
  createLicense?: typeof createCommercialLicense;
}

export function makeDeps(overrides: Partial<OrderDeps> = {}): OrderDeps {
  return {
    env: overrides.env ?? readCommerceEnv(),
    store: overrides.store ?? defaultOrdersStore(),
    http: overrides.http,
    createLicense: overrides.createLicense ?? createCommercialLicense,
  };
}

/** Resolve o store (default é assíncrono: precisa escolher engine). */
export async function resolveStore(deps: OrderDeps): Promise<OrdersStore> {
  return deps.store instanceof Promise ? deps.store : Promise.resolve(deps.store);
}

/** Trava por pedido dentro do processo: webhook + polling não intercalam. */
const inflight = new Map<string, Promise<OrderRecord>>();
function serialized(orderNsu: string, task: () => Promise<OrderRecord>): Promise<OrderRecord> {
  const previous = inflight.get(orderNsu) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  inflight.set(orderNsu, next);
  void next.catch(() => undefined).finally(() => {
    if (inflight.get(orderNsu) === next) inflight.delete(orderNsu);
  });
  return next;
}

/** URL de retorno: a própria /pagamento com o token público do pedido. */
export function redirectUrlFor(env: CommerceEnv, publicToken: string): string {
  const separator = env.redirectUrl.includes('?') ? '&' : '?';
  return `${env.redirectUrl}${separator}o=${publicToken}`;
}

/**
 * Fase 1 do fluxo: valida cliente, grava pedido PENDING e cria o link
 * de checkout na InfinitePay. O preço é sempre o do backend.
 */
export async function startOrder(
  input: unknown,
  deps: OrderDeps,
): Promise<{ order: OrderRecord; checkoutUrl: string }> {
  if (!commerceConfigured(deps.env)) {
    throw new CommerceError('NOT_CONFIGURED', 'Checkout não configurado.');
  }
  const customer = validateCustomer(input);
  const store = await resolveStore(deps);
  const order = await store.insert({
    id: randomUUID(),
    orderNsu: generateOrderNsu(),
    publicToken: generatePublicToken(),
    productId: PRODUCT_ID,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    amountExpected: PRODUCT_PRICE_CENTS,
    currency: PRODUCT_CURRENCY,
    createdAt: new Date().toISOString(),
  });
  logEvent('ORDER_CREATED', { orderNsu: order.orderNsu, amountExpected: order.amountExpected });

  try {
    const link = await createCheckoutLink({
      apiUrl: deps.env.apiUrl,
      handle: deps.env.handle,
      orderNsu: order.orderNsu,
      redirectUrl: redirectUrlFor(deps.env, order.publicToken),
      webhookUrl: deps.env.webhookUrl,
      customer,
      priceCents: PRODUCT_PRICE_CENTS,
      description: PRODUCT_DESCRIPTION,
      http: deps.http,
    });
    const updated = await store.attachCheckout(order.orderNsu, { checkoutUrl: link.checkoutUrl, slug: link.slug });
    logEvent('CHECKOUT_CREATED', { orderNsu: order.orderNsu, slug: link.slug });
    return { order: updated, checkoutUrl: link.checkoutUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.setState(order.orderNsu, 'FAILED', message.slice(0, 300));
    logEvent('CHECKOUT_FAILED', { orderNsu: order.orderNsu, reason: message.slice(0, 200) });
    throw error;
  }
}

/** Interpreta o corpo do webhook. Falta de campo obrigatório → CommerceError. */
export function parseWebhook(raw: unknown): WebhookEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new CommerceError('ORDER_NOT_FOUND', 'Webhook sem corpo.');
  }
  const body = raw as Record<string, unknown>;
  const text = (key: string): string | null => (typeof body[key] === 'string' && body[key] ? (body[key] as string) : null);
  const orderNsu = text('order_nsu');
  const transactionNsu = text('transaction_nsu');
  if (!orderNsu || !transactionNsu) {
    throw new CommerceError('ORDER_NOT_FOUND', 'Webhook sem order_nsu/transaction_nsu.');
  }
  const number = (key: string): number | null => (typeof body[key] === 'number' ? Math.trunc(body[key] as number) : null);
  return {
    orderNsu,
    transactionNsu,
    invoiceSlug: text('invoice_slug'),
    receiptUrl: text('receipt_url'),
    captureMethod: text('capture_method'),
    amount: number('amount'),
    paidAmount: number('paid_amount'),
  };
}

export interface ConfirmInput {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
  receiptUrl?: string | null;
  captureMethod?: string | null;
}

/**
 * Confirma o pagamento com a InfinitePay e, só se confirmado, gera a licença.
 * Idempotente: pedido já LICENSE_CREATED/COMPLETED retorna sem novo efeito.
 */
export async function confirmPayment(input: ConfirmInput, deps: OrderDeps): Promise<OrderRecord> {
  return serialized(input.orderNsu, async () => {
    const store = await resolveStore(deps);
    const order = await store.byOrderNsu(input.orderNsu);
    if (!order) throw new CommerceError('ORDER_NOT_FOUND', 'Pedido não encontrado.');
    if (order.status === 'LICENSE_CREATED' || order.status === 'COMPLETED') return order;

    const check = await paymentCheck({
      apiUrl: deps.env.apiUrl,
      handle: deps.env.handle,
      orderNsu: input.orderNsu,
      transactionNsu: input.transactionNsu,
      slug: input.slug,
      http: deps.http,
    });
    try {
      assertPaid(check, PRODUCT_PRICE_CENTS);
    } catch (error) {
      logEvent('PAYMENT_REJECTED', {
        orderNsu: input.orderNsu,
        success: check.success,
        paid: check.paid,
        amount: check.amount,
        paidAmount: check.paidAmount,
      });
      throw error;
    }
    logEvent('PAYMENT_VERIFIED', { orderNsu: input.orderNsu, installments: check.installments });

    const current = await store.byOrderNsu(input.orderNsu);
    if (current?.status === 'LICENSE_CREATED' || current?.status === 'COMPLETED') return current;

    const claim = await store.claimPaid(input.orderNsu, {
      transactionNsu: input.transactionNsu,
      paidAmount: check.paidAmount ?? check.amount,
      captureMethod: check.captureMethod ?? input.captureMethod ?? null,
      receiptUrl: input.receiptUrl ?? null,
      paidAt: new Date().toISOString(),
    });
    // Status PAID: este processo segura a trava por pedido (serialized),
    // então a criação da licença acontece uma única vez por processo.
    if (claim.order.status !== 'PAID') return claim.order;

    const create = deps.createLicense ?? createCommercialLicense;
    try {
      const issued = await create({
        baseUrl: deps.env.licenseApiUrl,
        adminKey: deps.env.licenseAdminKey,
        customerName: claim.order.customerName,
        customerEmail: claim.order.customerEmail,
        orderNsu: claim.order.orderNsu,
        http: deps.http,
      });
      const attached = await store.attachLicense(input.orderNsu, issued);
      logEvent('LICENSE_CREATED', { orderNsu: input.orderNsu, licenseId: issued.licenseId });
      return attached.order;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.setState(input.orderNsu, 'PAID', message.slice(0, 300));
      logEvent('LICENSE_FAILED', { orderNsu: input.orderNsu, reason: message.slice(0, 200) });
      throw error;
    }
  });
}

/** Webhook → confirmação. Devolve o resultado sem lançar para o route. */
export async function handleWebhook(
  raw: unknown,
  deps: OrderDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let event: WebhookEvent;
  try {
    event = parseWebhook(raw);
  } catch {
    return { status: 400, body: { ok: false, reason: 'INVALID_EVENT' } };
  }
  logEvent('WEBHOOK_RECEIVED', { orderNsu: event.orderNsu, transactionNsu: event.transactionNsu });

  const store = await resolveStore(deps);
  const order = await store.byOrderNsu(event.orderNsu);
  if (!order) {
    logEvent('PAYMENT_REJECTED', { orderNsu: event.orderNsu, reason: 'ORDER_NOT_FOUND' });
    return { status: 200, body: { ok: false, reason: 'ORDER_NOT_FOUND' } };
  }

  const slug = event.invoiceSlug ?? order.infinitepaySlug;
  if (!slug) {
    logEvent('PAYMENT_REJECTED', { orderNsu: event.orderNsu, reason: 'SLUG_MISSING' });
    return { status: 400, body: { ok: false, reason: 'SLUG_MISSING' } };
  }

  try {
    await confirmPayment(
      {
        orderNsu: event.orderNsu,
        transactionNsu: event.transactionNsu,
        slug,
        receiptUrl: event.receiptUrl,
        captureMethod: event.captureMethod,
      },
      deps,
    );
    return { status: 200, body: { ok: true } };
  } catch (error) {
    const code = error instanceof CommerceError ? error.code : 'UNEXPECTED';
    if (code === 'PAYMENT_NOT_CONFIRMED' || code === 'AMOUNT_MISMATCH' || code === 'TRANSACTION_CONFLICT' || code === 'LICENSE_API_UNAVAILABLE') {
      return { status: 400, body: { ok: false, reason: code } };
    }
    if (code === 'ORDER_NOT_FOUND') return { status: 200, body: { ok: false, reason: code } };
    return { status: 400, body: { ok: false, reason: code } };
  }
}

/**
 * Fallback do redirect: usa os parâmetros deixados pela InfinitePay
 * (order_nsu, transaction_nsu, slug) apenas para localizar e reconciliar.
 * Chegar em /pagamento nunca gera licença sozinho.
 */
export async function reconcileFromRedirect(
  order: OrderRecord,
  params: { orderNsu?: string | null; transactionNsu?: string | null; slug?: string | null; receiptUrl?: string | null; captureMethod?: string | null },
  deps: OrderDeps,
): Promise<OrderRecord> {
  if (order.status !== 'PENDING' && order.status !== 'FAILED' && order.status !== 'PAID') return order;
  if (params.orderNsu && params.orderNsu !== order.orderNsu) return order;
  if (!params.transactionNsu || !params.slug) {
    logEvent('RECONCILE_SKIPPED', { orderNsu: order.orderNsu, reason: 'MISSING_PARAMS' });
    return order;
  }
  return attemptConfirm(
    order,
    {
      transactionNsu: params.transactionNsu,
      slug: params.slug,
      receiptUrl: params.receiptUrl ?? null,
      captureMethod: params.captureMethod ?? null,
    },
    deps,
  );
}

/**
 * Retentativa com os dados já gravados no pedido (PAID sem licença):
 * o webhook pode não ter chegado e a página pode ter sido reaberta.
 */
export async function retryFulfilment(order: OrderRecord, deps: OrderDeps): Promise<OrderRecord> {
  if (order.status !== 'PAID' || order.licenseKey) return order;
  if (!order.transactionNsu || !order.infinitepaySlug) return order;
  return attemptConfirm(
    order,
    {
      transactionNsu: order.transactionNsu,
      slug: order.infinitepaySlug,
      receiptUrl: order.receiptUrl,
      captureMethod: order.captureMethod,
    },
    deps,
  );
}

async function attemptConfirm(
  order: OrderRecord,
  params: { transactionNsu: string; slug: string; receiptUrl: string | null; captureMethod: string | null },
  deps: OrderDeps,
): Promise<OrderRecord> {
  try {
    return await confirmPayment(
      { orderNsu: order.orderNsu, transactionNsu: params.transactionNsu, slug: params.slug, receiptUrl: params.receiptUrl, captureMethod: params.captureMethod },
      deps,
    );
  } catch (error) {
    // Pagamento ainda não confirmado (ou valor divergente): o cliente vê
    // "processando" e o polling/webhook tenta de novo. Nunca gera licença.
    const code = error instanceof CommerceError ? error.code : 'UNEXPECTED';
    logEvent('RECONCILE_SKIPPED', { orderNsu: order.orderNsu, reason: code });
    const store = await resolveStore(deps);
    return (await store.byOrderNsu(order.orderNsu)) ?? order;
  }
}

export interface PublicStatus {
  status: OrderStatus;
  licenseKey?: string;
  downloadUrl?: string;
  receiptUrl?: string | null;
  license: {
    plan: string;
    maxDevices: number;
    updatesIncluded: number;
    validUntil: null;
  };
}

/** Payload público do polling — sem dados pessoais. */
export async function publicStatus(order: OrderRecord, downloadUrl: string | null, deps: OrderDeps): Promise<PublicStatus> {
  const store = await resolveStore(deps);
  const deliverable = (ENTREGABLE as readonly string[]).includes(order.status) && Boolean(order.licenseKey);
  if (deliverable && order.status === 'LICENSE_CREATED') {
    await store.markDelivered(order.orderNsu);
    logEvent('ORDER_COMPLETED', { orderNsu: order.orderNsu });
  }
  const ready = deliverable || order.status === 'COMPLETED';
  const status: PublicStatus = {
    status: order.status,
    receiptUrl: order.receiptUrl,
    license: { plan: 'BETA_LIFETIME', maxDevices: 2, updatesIncluded: 3, validUntil: null },
  };
  if (ready && order.licenseKey) status.licenseKey = order.licenseKey;
  if (downloadUrl) status.downloadUrl = downloadUrl;
  return status;
}
