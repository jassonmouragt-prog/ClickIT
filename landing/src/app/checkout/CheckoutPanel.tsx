'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  CHECKOUT_URL,
  PRODUCT_FULL_NAME,
  PRODUCT_PRICE_DISPLAY,
  PRODUCT_PRICE_READY,
} from '@/config/product';
import { Logo } from '@/components/Logo';

const INCLUDED = [
  'Seleção inteligente',
  'ClickIT Picks',
  'Agrupamento de sequências',
  'Detecção de possíveis falhas',
  'Comparação lado a lado',
  'Revisão, favoritas e estrelas',
  'Perfil de edição e preview',
  'Exportação XMP',
  'Atualizações da beta',
];

export function CheckoutPanel(): ReactNode {
  const ready = PRODUCT_PRICE_READY && Boolean(CHECKOUT_URL);

  return (
    <div className="w-full max-w-3xl">
      <Link href="/#topo" className="mb-10 inline-flex" aria-label="Voltar para a página inicial">
        <Logo />
      </Link>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-[linear-gradient(165deg,rgba(20,26,37,0.96),rgba(10,14,21,0.96))] shadow-panel">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="p-7 md:p-9">
            <p className="eyebrow">checkout seguro</p>
            <h1 className="mt-4 text-[clamp(26px,3.6vw,36px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              {PRODUCT_FULL_NAME}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">
              Pagamento processado pela InfinitePay. Após a confirmação, a licença é ativada na sua instalação sem
              precisar reinstalar.
            </p>

            <ul className="mt-7 grid gap-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-mist">
                  <svg
                    viewBox="0 0 24 24"
                    className="mt-0.5 h-4 w-4 shrink-0 text-cyan"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m5 12.5 4.2 4.2L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-between gap-6 border-t border-hairline bg-white/[0.03] p-7 md:border-t-0 md:border-l md:p-9">
            <div>
              <p className="eyebrow">valor</p>
              <p className="mt-3 text-[38px] leading-none font-semibold tracking-[-0.04em] text-cloud">
                {PRODUCT_PRICE_DISPLAY}
              </p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                Licença para Windows · ativação no seu computador.
              </p>
            </div>

            <div>
              {ready ? (
                <a
                  href={CHECKOUT_URL ?? '#'}
                  className="btn-primary w-full"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Ir para o pagamento
                </a>
              ) : (
                <div className="rounded-xl border border-hairline bg-white/[0.03] p-4 text-center">
                  <p className="text-[15px] font-semibold text-cloud">Disponível em breve</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-mist">
                    O checkout está sendo preparado. Enquanto isso, experimente a ClickIT por 20 minutos.
                  </p>
                </div>
              )}

              <Link href="/#trial" className="btn-ghost mt-3 w-full">
                Testar grátis por 20 minutos
              </Link>
              <Link href="/#topo" className="mt-4 block text-center text-[13px] text-fog transition-colors hover:text-mist">
                Voltar para a página
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
