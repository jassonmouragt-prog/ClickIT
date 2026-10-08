'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { PRODUCT_FULL_NAME, PRODUCT_PRICE_DISPLAY, PRODUCT_PRICE_READY } from '@/config/product';
import { goToCheckout, startCheckout } from '@/lib/checkout';

const INCLUDES = [
  'Seleção inteligente',
  'ClickIT Picks',
  'Agrupamento de sequências',
  'Detecção de possíveis falhas',
  'Comparação lado a lado',
  'Revisão',
  'Perfil de edição',
  'Preview de edição',
  'Exportação XMP',
  'Atualizações da beta',
];

export function Offer(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelector('[data-offer]'), {
      scrollTrigger: { trigger: scope, start: 'top 76%', once: true },
      y: 34,
      opacity: 0,
      scale: 0.98,
      filter: 'blur(10px)',
      duration: 0.9,
      ease: 'power3.out',
      clearProps: 'filter',
    });
  });

  const handleBuy = (): void => {
    const result = startCheckout();
    if (result.status === 'redirect') {
      window.location.href = result.url;
      return;
    }
    goToCheckout();
  };

  return (
    <section id="oferta" ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="oferta"
          title={['Comece a recuperar', 'suas horas.']}
          lead="Licença para Windows, uso no seu computador, atualizações incluídas durante a beta."
          align="center"
        />

        <div
          data-offer
          className="relative mx-auto mt-12 max-w-4xl overflow-hidden rounded-3xl border border-hairline bg-[linear-gradient(165deg,rgba(20,26,37,0.96),rgba(10,14,21,0.96))] p-7 shadow-panel md:p-10"
        >
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(108,76,255,0.22),transparent_75%)] blur-2xl" />

          <div className="grid grid-cols-1 gap-9 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-12">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-[var(--signature)] px-3 py-1.5 text-[12px] font-semibold text-white">
                  {PRODUCT_FULL_NAME}
                </span>
                <span className="pill">licença única</span>
              </div>

              <h3 className="mt-6 text-[clamp(26px,3.4vw,36px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
                Tudo o que a ClickIT já faz hoje.
              </h3>

              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {INCLUDES.map((item) => (
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

            <div className="flex flex-col justify-between gap-6 rounded-2xl border border-hairline bg-white/[0.03] p-6">
              <div>
                <p className="eyebrow">valor</p>
                <p className="mt-3 text-[38px] leading-none font-semibold tracking-[-0.04em] text-cloud">
                  {PRODUCT_PRICE_DISPLAY}
                </p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                  {PRODUCT_PRICE_READY
                    ? 'Pagamento processado pela InfinitePay. A licença é ativada sem reinstalar.'
                    : 'Valor em definição final. Enquanto isso, teste a ClickIT por 20 minutos.'}
                </p>
              </div>

              <div>
                <button type="button" onClick={handleBuy} className="btn-primary w-full">
                  Comprar ClickIT
                </button>

                <a href="/#trial" className="btn-ghost mt-3 w-full">
                  Testar grátis por 20 minutos
                </a>

                <p className="mt-3 text-center text-[12.5px] text-fog">
                  {PRODUCT_PRICE_READY ? 'Compra única · sem renovação automática' : 'Disponível em breve'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
