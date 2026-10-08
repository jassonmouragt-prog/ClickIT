'use client';

import { CHECKOUT_URL, PRODUCT_PRICE_READY } from '@/config/product';

export type CheckoutResult =
  | { status: 'redirect'; url: string }
  | { status: 'unavailable'; reason: 'no-checkout' | 'no-price' };

/**
 * Inicia a compra da ClickIT.
 *
 * Arquitetura prevista:
 *   Landing → /checkout → InfinitePay → pagamento → licença
 *
 * Enquanto `CHECKOUT_URL` (ou o preço) não estiver configurado, nada é
 * chamado externamente: o CTA recebe um resultado "unavailable" e a UI
 * mostra uma mensagem amigável. Nenhuma URL é improvisada.
 */
export function startCheckout(): CheckoutResult {
  if (!PRODUCT_PRICE_READY) return { status: 'unavailable', reason: 'no-price' };
  if (!CHECKOUT_URL) return { status: 'unavailable', reason: 'no-checkout' };
  return { status: 'redirect', url: CHECKOUT_URL };
}

/**
 * Navega para a rota de checkout da landing.
 * A rota é quem decide entre seguir para a InfinitePay ou exibir o
 * estado "Disponível em breve".
 */
export function goToCheckout(): void {
  if (typeof window === 'undefined') return;
  window.location.href = '/checkout';
}
