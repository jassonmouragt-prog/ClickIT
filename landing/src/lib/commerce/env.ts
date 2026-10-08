/**
 * Env vars do backend de commerce. Somente servidor.
 *
 * Nenhuma aqui pode ter prefixo NEXT_PUBLIC_: handle, chaves e URLs
 * internas nunca entram no bundle do browser.
 */
export interface CommerceEnv {
  siteUrl: string;
  apiUrl: string;
  handle: string;
  webhookUrl: string;
  redirectUrl: string;
  licenseApiUrl: string;
  licenseAdminKey: string;
}

type Env = Record<string, string | undefined>;

function trim(env: Env, key: string): string {
  return (env[key] ?? '').trim();
}

export function readCommerceEnv(source: Env = process.env): CommerceEnv {
  const siteUrl = trim(source, 'NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000';
  const redirectConfigured = trim(source, 'INFINITEPAY_REDIRECT_URL');
  return {
    siteUrl: siteUrl.replace(/\/+$/, ''),
    apiUrl: (trim(source, 'INFINITEPAY_API_URL') || 'https://api.checkout.infinitepay.io').replace(/\/+$/, ''),
    handle: trim(source, 'INFINITEPAY_HANDLE'),
    webhookUrl: trim(source, 'INFINITEPAY_WEBHOOK_URL'),
    redirectUrl: (redirectConfigured || `${siteUrl.replace(/\/+$/, '')}/pagamento`).replace(/\/+$/, ''),
    licenseApiUrl: (trim(source, 'LICENSE_API_URL') || 'http://127.0.0.1:8085').replace(/\/+$/, ''),
    licenseAdminKey: trim(source, 'LICENSE_ADMIN_KEY'),
  };
}

/**
 * Comercio pronto para vender: handle da InfinitePay, webhook público e
 * License API acessível. Sem isso o /checkout mostra "Disponível em breve".
 */
export function commerceConfigured(env: CommerceEnv = readCommerceEnv()): boolean {
  return Boolean(env.handle && env.webhookUrl && env.licenseApiUrl && env.licenseAdminKey);
}
