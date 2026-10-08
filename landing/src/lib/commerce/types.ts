import type { OrderStatus } from '../../config/commerce.ts';

export type { OrderStatus };

/** Dados do comprador coletados no formulário /checkout. */
export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
}

/** Pedido persistido no servidor. Espelha a tabela `orders`. */
export interface OrderRecord {
  id: string;
  orderNsu: string;
  publicToken: string;
  productId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  amountExpected: number;
  currency: string;
  status: OrderStatus;
  checkoutUrl: string | null;
  infinitepaySlug: string | null;
  transactionNsu: string | null;
  captureMethod: string | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  licenseId: string | null;
  licenseKey: string | null;
  licenseDeliveredAt: string | null;
  createdAt: string;
  paidAt: string | null;
  lastError: string | null;
}

export interface NewOrderInput {
  id: string;
  orderNsu: string;
  publicToken: string;
  productId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  amountExpected: number;
  currency: string;
  createdAt: string;
}

/** Confirmação de pagamento vinda do webhook ou do redirect. */
export interface PaymentClaim {
  transactionNsu: string;
  paidAmount: number | null;
  captureMethod: string | null;
  receiptUrl: string | null;
  paidAt: string;
}

/** Resultado estruturado do POST /payment_check da InfinitePay. */
export interface PaymentCheckResult {
  success: boolean;
  paid: boolean;
  amount: number | null;
  paidAmount: number | null;
  installments: number | null;
  captureMethod: string | null;
}

/** Evento bruto aceito do webhook da InfinitePay. */
export interface WebhookEvent {
  orderNsu: string;
  transactionNsu: string;
  invoiceSlug: string | null;
  receiptUrl: string | null;
  captureMethod: string | null;
  amount: number | null;
  paidAmount: number | null;
}

/** Link de checkout devolvido pela InfinitePay. */
export interface CheckoutLink {
  checkoutUrl: string;
  slug: string | null;
}

export type CommerceErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_CUSTOMER'
  | 'ORDER_NOT_FOUND'
  | 'CHECKOUT_UNAVAILABLE'
  | 'PAYMENT_NOT_CONFIRMED'
  | 'AMOUNT_MISMATCH'
  | 'TRANSACTION_CONFLICT'
  | 'LICENSE_API_UNAVAILABLE';

/** Erro de domínio com código estável para a camada HTTP. */
export class CommerceError extends Error {
  readonly code: CommerceErrorCode;

  constructor(code: CommerceErrorCode, message: string) {
    super(message);
    this.name = 'CommerceError';
    this.code = code;
  }
}
