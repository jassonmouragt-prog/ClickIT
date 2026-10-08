export type LogEvent =
  | 'ORDER_CREATED'
  | 'CHECKOUT_CREATED'
  | 'CHECKOUT_FAILED'
  | 'WEBHOOK_RECEIVED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_REJECTED'
  | 'LICENSE_CREATED'
  | 'LICENSE_FAILED'
  | 'ORDER_COMPLETED'
  | 'RECONCILE_SKIPPED'
  | 'ORDER_LISTED'
  | 'ORDER_RECONCILED';

const FORBIDDEN = /^(licenseKey|license_key|key|authorization|card|cvv|pan|serial)$/i;

/**
 * Log estruturado em JSON. Nunca escreve serial, cartão ou credencial:
 * chaves sensíveis são descartadas antes de serializar.
 */
export function logEvent(event: LogEvent, data: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (FORBIDDEN.test(key)) continue;
    safe[key] = value;
  }
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...safe })}\n`);
}
