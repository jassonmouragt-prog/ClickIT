/**
 * Regras comerciais do produto — APENAS servidor.
 *
 * Este módulo é a fonte de verdade do que é cobrado e entregue.
 * Nada aqui pode ser lido pelo browser: o preço, o handle da InfinitePay
 * e qualquer credencial vivem somente em env vars de servidor.
 *
 * O navegador nunca envia preço: o backend define `PRODUCT_PRICE_CENTS`.
 */

export const PRODUCT_ID = 'clickit-beta-lifetime';
export const PRODUCT_NAME = 'ClickIT Beta';
export const PRODUCT_DESCRIPTION = 'ClickIT Beta - Licença vitalícia';

/** Preço em centavos. R$ 347,00. */
export const PRODUCT_PRICE_CENTS = 34700;
export const PRODUCT_CURRENCY = 'BRL';

export const MAX_DEVICES = 2;
export const PLAN = 'BETA_LIFETIME';
export const UPDATES_INCLUDED = 3;
export const UPDATES_USED = 0;

/** Versão adquirida pelo comprador (início do ciclo de atualizações). */
export const PURCHASED_VERSION = '0.1.0';

export const LICENSE_EXPIRES_AT: null = null;

/** Formato do serial entregue: CLICKIT-XXXX-XXXX-XXXX. */
export const LICENSE_KEY_PATTERN = /^CLICKIT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

/**
 * Status possíveis de um pedido.
 *
 * PENDING → pedido criado, aguardando pagamento
 * PAID    → pagamento confirmado via payment_check
 * LICENSE_CREATED → licença criada na License API
 * COMPLETED → serial disponível para entrega
 * FAILED / CANCELLED → fim de linha
 */
export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'LICENSE_CREATED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'PAID',
  'LICENSE_CREATED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

/** Estado final em que o serial pode ser exibido. */
export const ENTREGABLE: readonly OrderStatus[] = ['LICENSE_CREATED', 'COMPLETED'];
