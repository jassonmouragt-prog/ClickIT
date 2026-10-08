/**
 * Configuração comercial central da ClickIT.
 *
 * Tudo que é preço, URL de download, checkout ou suporte vive aqui.
 * O valor publicado aqui é o oficial da oferta (R$ 347,00);
 * as variáveis abaixo servem apenas para sobrescrever em outros ambientes.
 *
 * Variáveis esperadas (opcionais):
 *   NEXT_PUBLIC_PRODUCT_PRICE          ex.: "347"  (sem R$, sem separador)
 *   NEXT_PUBLIC_PRODUCT_PRICE_DISPLAY  ex.: "R$ 347,00" (sobrepõe o valor acima)
 *   NEXT_PUBLIC_DOWNLOAD_URL           URL pública do instalador
 *   NEXT_PUBLIC_SUPPORT_URL            canal de suporte
 *
 * O preço cobrado no checkout é SEMPRE o do backend (`config/commerce.ts`);
 * estes valores afetam apenas a exibição na página.
 */

const rawPrice = process.env.NEXT_PUBLIC_PRODUCT_PRICE?.trim();
const rawDisplay = process.env.NEXT_PUBLIC_PRODUCT_PRICE_DISPLAY?.trim();

/** Preço exibido, sem "R$". */
export const PRODUCT_PRICE: string = rawPrice && rawPrice.length > 0 ? rawPrice : '347';

/** Preço exibido na página, já formatado. */
export const PRODUCT_PRICE_DISPLAY: string =
  rawDisplay && rawDisplay.length > 0 ? rawDisplay : 'R$ 347,00';

/** `true` quando o preço real já pode ser mostrado e cobrado. */
export const PRODUCT_PRICE_READY: boolean = true;

export const PRODUCT_NAME = 'ClickIT';
export const PRODUCT_FULL_NAME = 'ClickIT para Windows';
export const PRODUCT_TAGLINE = 'Seleção inteligente para fotógrafos.';
export const PRODUCT_PLATFORM = 'Windows';

/** URL do instalador. `null` = download ainda não publicado. */
export const DOWNLOAD_URL: string | null = normalize(process.env.NEXT_PUBLIC_DOWNLOAD_URL);

export const SUPPORT_URL: string | null = normalize(process.env.NEXT_PUBLIC_SUPPORT_URL);

/** Minutos de trial completo oferecidos na página. */
export const TRIAL_MINUTES = 20;

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}
