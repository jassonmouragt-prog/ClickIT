import { NextResponse } from 'next/server';
import { DOWNLOAD_URL } from '@/config/product';
import { makeDeps, publicStatus, reconcileFromRedirect, retryFulfilment } from '@/lib/commerce/orders';

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
  let deps: Awaited<ReturnType<typeof makeDeps>>;
  try {
    deps = makeDeps();
  } catch {
    return NextResponse.json(
      { ok: false, status: 'STORE_UNAVAILABLE' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  const order = deps.store.byLocator(token);
  if (!order) {
    return NextResponse.json({ ok: false, status: 'NOT_FOUND' }, { status: 404, headers: { 'cache-control': 'no-store' } });
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

  const fresh = deps.store.byLocator(token) ?? current;
  return NextResponse.json(
    { ok: true, ...publicStatus(fresh, DOWNLOAD_URL, deps) },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
