'use client';

/**
 * Inicia a compra da ClickIT.
 *
 * Fluxo comercial: Landing → /checkout → InfinitePay → webhook →
 * payment_check → licença. O CTA sempre cai na rota /checkout, que é
 * quem conversa com o backend — o preço nunca sai do navegador.
 */
export function goToCheckout(): void {
  if (typeof window === 'undefined') return;
  window.location.href = '/checkout';
}
