/**
 * CLI administrativa de pedidos comerciais.
 *
 *   npm run orders:list
 *   npm run orders:get <orderNsu|publicToken>
 *   npm run orders:reconcile [orderNsu]
 *
 * Não imprime credenciais: o serial só aparece em `get`, que é o caminho
 * de recuperação administrativa por e-mail/pedido.
 */
import { ordersDb } from '../src/lib/commerce/db.ts';
import { readCommerceEnv } from '../src/lib/commerce/env.ts';
import { confirmPayment, makeDeps } from '../src/lib/commerce/orders.ts';
import type { OrdersStore } from '../src/lib/commerce/db.ts';
import type { OrderRecord } from '../src/lib/commerce/types.ts';

const file = process.env.ORDERS_SQLITE ?? 'data/orders.sqlite';

function line(order: OrderRecord): string {
  const paid = order.paidAt ? order.paidAt.slice(0, 19) : '-';
  return [
    order.status.padEnd(16),
    order.orderNsu,
    order.customerEmail.padEnd(30),
    (order.transactionNsu ?? '-').padEnd(38),
    (order.licenseId ?? '-').slice(0, 8).padEnd(8),
    paid,
  ].join('  ');
}

function header(): string {
  return ['STATUS'.padEnd(16), 'ORDER_NSU'.padEnd(35), 'EMAIL'.padEnd(30), 'TRANSACTION_NSU'.padEnd(38), 'LICENCA'.padEnd(8), 'PAGO_EM'].join('  ');
}

function detail(order: OrderRecord): void {
  console.log(`Pedido:        ${order.orderNsu}`);
  console.log(`Token público: ${order.publicToken}`);
  console.log(`Status:        ${order.status}`);
  console.log(`Cliente:       ${order.customerName} <${order.customerEmail}>`);
  console.log(`WhatsApp:      ${order.customerPhone ?? '-'}`);
  console.log(`Valor:         ${order.amountExpected} ${order.currency} (esperado)`);
  console.log(`Criado em:     ${order.createdAt}`);
  console.log(`Pago em:       ${order.paidAt ?? '-'}`);
  console.log(`InfinitePay:   slug=${order.infinitepaySlug ?? '-'} transação=${order.transactionNsu ?? '-'} forma=${order.captureMethod ?? '-'}`);
  console.log(`Recibo:        ${order.receiptUrl ?? '-'}`);
  console.log(`Licença:       ${order.licenseId ?? '-'} entregue=${order.licenseDeliveredAt ?? '-'}`);
  console.log(`Serial:        ${order.licenseKey ?? '-'}`);
  if (order.checkoutUrl) console.log(`Checkout:      ${order.checkoutUrl}`);
  if (order.lastError) console.log(`Último erro:   ${order.lastError}`);
}

async function reconcile(store: OrdersStore, only?: string): Promise<void> {
  const targets = store.list(200).filter(order => {
    if (only) return order.orderNsu === only || order.publicToken === only;
    return (order.status === 'PAID' && !order.licenseKey) || order.status === 'PENDING';
  });
  if (!targets.length) {
    console.log('Nenhum pedido pendente de reconciliação.');
    return;
  }
  const deps = makeDeps({ env: readCommerceEnv(), store });
  for (const order of targets) {
    if (order.status === 'PAID' && order.transactionNsu && order.infinitepaySlug) {
      try {
        const result = await confirmPayment(
          { orderNsu: order.orderNsu, transactionNsu: order.transactionNsu, slug: order.infinitepaySlug, receiptUrl: order.receiptUrl, captureMethod: order.captureMethod },
          deps,
        );
        console.log(`${order.orderNsu} → ${result.status}`);
      } catch (error) {
        console.log(`${order.orderNsu} → falhou: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (order.status === 'PAID') {
      console.log(`${order.orderNsu} → PAID sem transaction_nsu/slug; aguarde o webhook.`);
    } else {
      console.log(`${order.orderNsu} → PENDING; sem payment_check possível sem transaction_nsu + slug.`);
    }
  }
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  const store = ordersDb(file);
  try {
    if (command === 'list') {
      console.log(header());
      for (const order of store.list(50)) console.log(line(order));
    } else if (command === 'get') {
      if (!argument) {
        console.error('Uso: orders:get <orderNsu|publicToken>');
        process.exit(1);
      }
      const order = store.byLocator(argument);
      if (!order) {
        console.error('Pedido não encontrado.');
        process.exit(1);
      }
      detail(order);
    } else if (command === 'reconcile') {
      await reconcile(store, argument);
    } else {
      console.log(`Uso:
  orders:list
  orders:get <orderNsu|publicToken>
  orders:reconcile [orderNsu]`);
      process.exit(argument === undefined && command === undefined ? 0 : 1);
    }
  } finally {
    store.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
