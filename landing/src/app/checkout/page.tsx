import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CheckoutPanel } from './CheckoutPanel';

export const metadata: Metadata = {
  title: 'Comprar ClickIT',
  description: 'Finalize a compra da ClickIT para Windows e ative sua licença.',
  alternates: { canonical: '/checkout' },
  robots: { index: false, follow: false },
};

export default function CheckoutPage(): ReactNode {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 h-[520px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(57,139,255,0.16),transparent_75%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,166,183,0.25),transparent)]" />
      </div>

      <CheckoutPanel />
    </main>
  );
}
