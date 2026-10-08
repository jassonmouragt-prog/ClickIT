import { CommerceError, type CheckoutLink, type CustomerInput, type PaymentCheckResult } from './types.ts';

export type HttpMethod = 'POST';

export interface HttpResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Transporte HTTP injetável — os testes usam um fake, sem rede. */
export type HttpJson = (url: string, init: { method: HttpMethod; headers: Record<string, string>; body: string }) => Promise<HttpResponse>;

export const fetchJson: HttpJson = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(10_000),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
};

interface LinkPayloadInput {
  handle: string;
  orderNsu: string;
  redirectUrl: string;
  webhookUrl: string;
  customer: CustomerInput;
  priceCents: number;
  description: string;
}

/**
 * Payload do POST /links. O preço vem sempre do backend:
 * o navegador não participa desta montagem.
 */
export function buildLinkPayload(input: LinkPayloadInput): Record<string, unknown> {
  return {
    handle: input.handle,
    items: [{ quantity: 1, price: input.priceCents, description: input.description }],
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    webhook_url: input.webhookUrl,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      phone_number: input.customer.phone,
    },
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Math.trunc(Number(value));
  return null;
}

/** Cria o link de pagamento hospedado. Retorna a URL para onde o cliente vai. */
export async function createCheckoutLink(
  input: LinkPayloadInput & { apiUrl: string; http?: HttpJson },
): Promise<CheckoutLink> {
  const http = input.http ?? fetchJson;
  const payload = buildLinkPayload(input);
  const result = await http(`${input.apiUrl}/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (result.body ?? {}) as Record<string, unknown>;
  const checkoutUrl = asString(body.checkout_url) ?? asString(body.url) ?? asString(body.link);
  if (!result.ok || !checkoutUrl) {
    throw new CommerceError(
      'CHECKOUT_UNAVAILABLE',
      `InfinitePay não criou o link (status ${result.status}).`,
    );
  }
  return { checkoutUrl, slug: asString(body.slug) ?? asString(body.invoice_slug) };
}

export interface PaymentCheckInput {
  apiUrl: string;
  handle: string;
  orderNsu: string;
  transactionNsu: string;
  slug: string;
  http?: HttpJson;
}

/**
 * Consulta oficial POST /payment_check.
 * Só `success === true && paid === true` conta como pagamento aprovado.
 */
export async function paymentCheck(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  const http = input.http ?? fetchJson;
  const result = await http(`${input.apiUrl}/payment_check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      handle: input.handle,
      order_nsu: input.orderNsu,
      transaction_nsu: input.transactionNsu,
      slug: input.slug,
    }),
  });
  const body = (result.body ?? {}) as Record<string, unknown>;
  return {
    success: body.success === true,
    paid: body.paid === true,
    amount: asNumber(body.amount),
    paidAmount: asNumber(body.paid_amount),
    installments: asNumber(body.installments),
    captureMethod: asString(body.capture_method),
  };
}

/**
 * Confere se a confirmação bate com o esperado.
 * Recusa valor divergente — nunca gera licença em estado ambíguo.
 */
export function assertPaid(check: PaymentCheckResult, expectedCents: number): void {
  if (!check.success || !check.paid) {
    throw new CommerceError('PAYMENT_NOT_CONFIRMED', 'payment_check não confirmou o pagamento.');
  }
  const coherent = check.amount === expectedCents || check.paidAmount === expectedCents;
  if (!coherent) {
    throw new CommerceError(
      'AMOUNT_MISMATCH',
      `Valor confirmado (${check.amount ?? '?'}/${check.paidAmount ?? '?'}) difere do esperado (${expectedCents}).`,
    );
  }
}
