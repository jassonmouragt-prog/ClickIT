/**
 * Configuração comercial central da ClickIT.
 *
 * Tudo que é preço, URL de download, checkout ou suporte vive aqui.
 * Enquanto um valor não estiver definido a página não quebra: os CTAs
 * apenas caem em um estado "Disponível em breve".
 *
 * Variáveis esperadas (opcionais):
 *   NEXT_PUBLIC_PRODUCT_PRICE          ex.: "197"  (sem R$, sem separador)
 *   NEXT_PUBLIC_PRODUCT_PRICE_DISPLAY  ex.: "R$ 197" (sobrepõe o valor acima)
 *   NEXT_PUBLIC_DOWNLOAD_URL           URL pública do instalador
 *   NEXT_PUBLIC_CHECKOUT_URL           URL do checkout InfinitePay
 *   NEXT_PUBLIC_SUPPORT_URL            canal de suporte
 */

const rawPrice = process.env.NEXT_PUBLIC_PRODUCT_PRICE?.trim();
const rawDisplay = process.env.NEXT_PUBLIC_PRODUCT_PRICE_DISPLAY?.trim();

/** Preço bruto, quando conhecido. `null` = preço ainda não publicado. */
export const PRODUCT_PRICE: string | null = rawPrice && rawPrice.length > 0 ? rawPrice : null;

/**
 * Preço exibido na página.
 * Placeholder visual `R$ XXX` enquanto o valor real não é configurado.
 */
export const PRODUCT_PRICE_DISPLAY: string =
  rawDisplay && rawDisplay.length > 0 ? rawDisplay : PRODUCT_PRICE ? `R$ ${PRODUCT_PRICE}` : 'R$ XXX';

/** `true` quando o preço real já pode ser mostrado e cobrado. */
export const PRODUCT_PRICE_READY: boolean =
  Boolean(rawDisplay && rawDisplay.length > 0) || Boolean(PRODUCT_PRICE);

export const PRODUCT_NAME = 'ClickIT';
export const PRODUCT_FULL_NAME = 'ClickIT para Windows';
export const PRODUCT_TAGLINE = 'Seleção inteligente para fotógrafos.';
export const PRODUCT_PLATFORM = 'Windows';

/** URL do instalador. `null` = download ainda não publicado. */
export const DOWNLOAD_URL: string | null = normalize(process.env.NEXT_PUBLIC_DOWNLOAD_URL);

/** URL do checkout (InfinitePay). `null` = checkout ainda não publicado. */
export const CHECKOUT_URL: string | null = normalize(process.env.NEXT_PUBLIC_CHECKOUT_URL);

export const SUPPORT_URL: string | null = normalize(process.env.NEXT_PUBLIC_SUPPORT_URL);

/** Minutos de trial completo oferecidos na página. */
export const TRIAL_MINUTES = 20;

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}
