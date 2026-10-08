import { NextResponse } from 'next/server';
import { CommerceError } from '@/lib/commerce/types';
import { makeDeps, startOrder } from '@/lib/commerce/orders';

/**
 * Cria o pedido e o link de checkout na InfinitePay.
 * O preço NUNCA vem do cliente: é sempre o de config/commerce.ts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    const { checkoutUrl } = await startOrder(body, makeDeps());
    return NextResponse.json({ ok: true, checkoutUrl }, { status: 201 });
  } catch (error) {
    const code = error instanceof CommerceError ? error.code : 'UNEXPECTED';
    const status = code === 'INVALID_CUSTOMER' ? 400 : code === 'NOT_CONFIGURED' || code === 'STORE_UNAVAILABLE' ? 503 : code === 'CHECKOUT_UNAVAILABLE' ? 502 : 500;
    if (!(error instanceof CommerceError)) {
      console.error('checkout falhou:', error instanceof Error ? error.message : String(error));
    }
    return NextResponse.json({ ok: false, code }, { status });
  }
}
