'use client';

import { useRef, type ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';

const CONTROL = [
  { title: 'Trocar o Pick', body: 'Escolha outra foto do grupo e a seleção passa a seguir a sua decisão.' },
  { title: 'Recuperar uma rejeitada', body: 'Nada some: rejeitadas continuam disponíveis para reavaliação.' },
  { title: 'Comparar lado a lado', body: 'Veja as semelhantes juntas e decida pelo detalhe que importa.' },
  { title: 'Favoritar e finalizar', body: 'Estrelas, favoritos e seleção organizam a entrega final.' },
];

export function HumanReview(): ReactNode {
  const numberRef = useRef<HTMLSpanElement>(null);

  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-control]'), {
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      y: 24,
      opacity: 0,
      duration: 0.7,
      stagger: 0.1,
      ease: 'power3.out',
    });

    const counter = { value: 0 };
    const node = numberRef.current;
    if (node) {
      gsap.fromTo(counter, { value: 0 }, {
        value: 1000,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: scope, start: 'top 70%', once: true },
        onUpdate: () => {
          node.textContent = Math.round(counter.value).toLocaleString('pt-BR');
        },
      });
    }

    gsap.from(scope.querySelectorAll('[data-after]'), {
      scrollTrigger: { trigger: scope, start: 'top 58%', once: true },
      y: 22,
      opacity: 0,
      scale: 0.97,
      duration: 0.75,
      stagger: 0.12,
      ease: 'power3.out',
    });

    gsap.from(scope.querySelector('[data-flow-arrow]'), {
      scrollTrigger: { trigger: scope, start: 'top 60%', once: true },
      opacity: 0,
      y: -10,
      duration: 0.6,
      ease: 'power2.out',
    });
  });

  return (
    <section ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_45%_at_75%_50%,rgba(108,76,255,0.08),transparent)]" />

      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <SectionHeader
              eyebrow="controle humano"
              title={['A última palavra', 'continua sendo sua.']}
              lead="A ClickIT não substitui seu olhar. Ela reduz o trabalho repetitivo para que você concentre sua atenção nas decisões que realmente importam."
            />

            <ul className="mt-9 space-y-4">
              {CONTROL.map((item) => (
                <li key={item.title} data-control className="flex gap-4 border-t border-hairline pt-4">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--signature)]" />
                  <div>
                    <h3 className="text-[15.5px] font-semibold text-cloud">{item.title}</h3>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-mist">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-6 md:p-8">
            <div className="flex items-center justify-between">
              <span className="eyebrow">antes</span>
              <span className="text-[11px] text-fog">ensaio recém-chegado</span>
            </div>
            <p className="mt-3 text-[clamp(44px,7vw,72px)] leading-none font-semibold tracking-[-0.05em] text-cloud">
              <span ref={numberRef}>1.000</span>
            </p>
            <p className="mt-2 text-[14px] text-mist">imagens quase idênticas para abrir uma por uma</p>

            <div data-flow-arrow className="my-7 flex flex-wrap items-center justify-center gap-2">
              {['ClickIT Pick', 'Comparar', 'Trocar escolha', 'Selecionar'].map((step, index, all) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-hairline bg-white/[0.03] px-3 py-1.5 text-[11px] tracking-[0.14em] text-mist uppercase">
                    {step}
                  </span>
                  {index < all.length - 1 ? <span className="text-[12px] text-fog">↓</span> : null}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div data-after className="rounded-xl border border-hairline bg-white/[0.02] p-4">
                <p className="text-[26px] leading-none font-semibold text-signature">12</p>
                <p className="mt-2 text-[13px] text-mist">grupos de sequência organizados</p>
              </div>
              <div data-after className="rounded-xl border border-hairline bg-white/[0.02] p-4">
                <p className="text-[26px] leading-none font-semibold text-signature">12</p>
                <p className="mt-2 text-[13px] text-mist">ClickIT Picks em destaque</p>
              </div>
              <div data-after className="rounded-xl border border-hairline bg-white/[0.02] p-4">
                <p className="text-[26px] leading-none font-semibold text-signature">1</p>
                <p className="mt-2 text-[13px] text-mist">revisão humana para decidir</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-hairline pt-5">
              <span className="pill">favoritar</span>
              <span className="pill">estrelas</span>
              <span className="pill">rejeitar</span>
              <span className="pill">recuperar rejeitadas</span>
              <span className="pill">exportar originais</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
