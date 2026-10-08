import { NextResponse } from 'next/server';
import { DOWNLOAD_URL } from '@/config/product';
import { makeDeps, publicStatus, reconcileFromRedirect, resolveStore, retryFulfilment } from '@/lib/commerce/orders';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/<publicToken>/status
 *
 * Polling da página /pagamento. Usa os parâmetros deixados pela InfinitePay
 * no redirect apenas para reconciliar (payment_check) — nunca gera licença
 * só porque alguém acessou a URL. Resposta sem dados pessoais.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const serialize = (body: Record<string, unknown>, status: number) =>
    NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

  const deps = makeDeps();
  const store = await resolveStore(deps).catch(() => null);
  if (!store) {
    return serialize({ ok: false, status: 'STORE_UNAVAILABLE' }, 503);
  }
  const order = await store.byLocator(token);
  if (!order) {
    return serialize({ ok: false, status: 'NOT_FOUND' }, 404);
  }

  const query = new URL(request.url).searchParams;
  const argument = (key: string): string | null => query.get(key);

  let current = order;
  try {
    if (current.status === 'PENDING' || current.status === 'FAILED') {
      current = await reconcileFromRedirect(
        current,
        {
          orderNsu: argument('order_nsu'),
          transactionNsu: argument('transaction_nsu'),
          slug: argument('slug'),
          receiptUrl: argument('receipt_url'),
          captureMethod: argument('capture_method'),
        },
        deps,
      );
    } else if (current.status === 'PAID' && !current.licenseKey) {
      current = await retryFulfilment(current, deps);
    }
  } catch {
    // Licença ainda indisponível: o polling tenta de novo.
  }

  const fresh = (await store.byLocator(token)) ?? current;
  return serialize({ ok: true, ...(await publicStatus(fresh, DOWNLOAD_URL, deps)) }, 200);
}