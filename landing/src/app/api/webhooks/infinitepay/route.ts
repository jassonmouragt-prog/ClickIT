import { NextResponse } from 'next/server';
import { handleWebhook, makeDeps } from '@/lib/commerce/orders';

/**
 * POST /api/webhooks/infinitepay
 *
 * Recebe a notificação da InfinitePay, confirma o pagamento com
 * payment_check e só então gera a licença. Idempotente: eventos
 * repetidos não criam segunda licença.
 *
 * Respostas (conforme documentação oficial):
 *   200 → tratado (inclusive pedido desconhecido, para não gerar retry infinito)
 *   400 → algo deu errado; a InfinitePay reenvia o evento
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  const { status, body } = await handleWebhook(raw, makeDeps());
  return NextResponse.json(body, { status });
}
