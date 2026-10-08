import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import './globals.css';
import { SITE_URL } from '@/lib/site';
import { PRODUCT_PRICE, PRODUCT_PRICE_DISPLAY, PRODUCT_PRICE_READY } from '@/config/product';
import { SmoothScroll } from '@/components/SmoothScroll';

const TITLE = 'ClickIT — Seleção Inteligente de Fotos para Fotógrafos';
const DESCRIPTION =
  'Selecione fotos mais rápido com a ClickIT. Agrupe sequências, encontre possíveis falhas, receba sugestões e revise seus melhores cliques com inteligência local.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'ClickIT',
  keywords: [
    'seleção de fotos',
    'software para fotógrafos',
    'triagem de fotografias',
    'ClickIT Picks',
    'revisão de ensaio',
    'organização de fotos',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'ClickIT',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ClickIT — seleção inteligente de fotos' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070A10',
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ClickIT',
  applicationCategory: 'PhotographyApplication',
  operatingSystem: 'Windows',
  description: DESCRIPTION,
  url: SITE_URL,
  inLanguage: 'pt-BR',
  offers: PRODUCT_PRICE_READY
    ? { '@type': 'Offer', price: PRODUCT_PRICE ?? '0', priceCurrency: 'BRL', availability: 'https://schema.org/InStock' }
    : { '@type': 'Offer', price: '0', priceCurrency: 'BRL', description: `Trial de 20 minutos · preço a definir (${PRODUCT_PRICE_DISPLAY})` },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="pt-BR" className="scroll-smooth">
      <body>
        <SmoothScroll />
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      </body>
    </html>
  );
}
