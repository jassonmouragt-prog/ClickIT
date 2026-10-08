import { SUPPORT_URL as SUPPORT_FROM_PRODUCT } from '@/config/product';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * URL de suporte. Vem da config comercial; fallback é a âncora de FAQ
 * da própria página — nunca um "#" solto.
 */
export const SUPPORT_URL = SUPPORT_FROM_PRODUCT ?? '/#faq';

export const NAV_LINKS = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#recursos', label: 'Recursos' },
  { href: '/#editar', label: 'Editar' },
  { href: '/#faq', label: 'FAQ' },
];
