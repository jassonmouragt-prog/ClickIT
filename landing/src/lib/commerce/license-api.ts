import {
  MAX_DEVICES,
  PLAN,
  PRODUCT_PRICE_CENTS,
  PURCHASED_VERSION,
  UPDATES_INCLUDED,
  UPDATES_USED,
  LICENSE_EXPIRES_AT,
} from '../../config/commerce.ts';
import { CommerceError } from './types.ts';
import { fetchJson, type HttpJson } from './infinitepay.ts';

export interface LicenseIssued {
  licenseId: string;
  licenseKey: string;
}

export interface CreateLicenseInput {
  baseUrl: string;
  adminKey: string;
  customerName: string;
  customerEmail: string;
  orderNsu: string;
  http?: HttpJson;
}

/**
 * Chama a License API existente (`POST /admin/licenses`) para emitir a
 * licença comercial. A licença NÃO depende do trial.
 *
 * Serial: gerado pelo gerador atual (CLICKIT-XXXX-XXXX-XXXX).
 * No banco da License API fica apenas o hash; este módulo devolve a chave
 * para a entrega inicial.
 */
export async function createCommercialLicense(input: CreateLicenseInput): Promise<LicenseIssued> {
  const http = input.http ?? fetchJson;
  const result = await http(`${input.baseUrl}/admin/licenses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.adminKey}`,
    },
    body: JSON.stringify({
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      maxDevices: MAX_DEVICES,
      plan: PLAN,
      expiresAt: LICENSE_EXPIRES_AT,
      purchasedVersion: PURCHASED_VERSION,
      updatesIncluded: UPDATES_INCLUDED,
      updatesUsed: UPDATES_USED,
      orderId: input.orderNsu,
      amountCents: PRODUCT_PRICE_CENTS,
    }),
  });
  const body = (result.body ?? {}) as Record<string, unknown>;
  const licenseKey = typeof body.licenseKey === 'string' ? body.licenseKey : '';
  const license = body.license as { id?: unknown } | undefined;
  const licenseId = typeof license?.id === 'string' ? license.id : '';
  if (!result.ok || !licenseKey || !licenseId) {
    throw new CommerceError(
      'LICENSE_API_UNAVAILABLE',
      `License API não emitiu a licença (status ${result.status}).`,
    );
  }
  return { licenseId, licenseKey };
}
