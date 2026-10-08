'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';

const BEFORE = [
  'Abrir foto por foto',
  'Comparar manualmente',
  'Procurar olhos fechados',
  'Revisar sequências inteiras',
  'Repetir as mesmas decisões',
];

const AFTER = [
  'Sequências agrupadas',
  'Problemas sinalizados',
  'Picks sugeridos',
  'Comparação rápida',
  'Seleção organizada',
];

export function Comparison(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope, { desktop }) => {
    gsap.fromTo(
      scope.querySelector('[data-wipe]'),
      { clipPath: desktop ? 'inset(0 100% 0 0)' : 'inset(100% 0 0 0)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        ease: 'none',
        scrollTrigger: { trigger: scope, start: 'top 68%', end: 'bottom 72%', scrub: 0.5 },
      },
    );

    gsap.from(scope.querySelector('[data-divider]'), {
      scrollTrigger: { trigger: scope, start: 'top 70%', once: true },
      scaleY: 0,
      opacity: 0,
      duration: 1,
      ease: 'power3.out',
    });

    gsap.from(scope.querySelectorAll('[data-row]'), {
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      x: (index) => (index < BEFORE.length ? -18 : 18),
      opacity: 0,
      duration: 0.6,
      stagger: 0.07,
      ease: 'power3.out',
    });
  });

  return (
    <section id="comparacao" ref={ref} className="relative py-24 md:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_100%,rgba(39,200,245,0.06),transparent)]" />

      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="antes / depois"
          title={['O mesmo trabalho.', 'Muito menos triagem manual.']}
          lead="A diferença não está em decidir por você, mas em chegar às decisões com muito menos repetição."
          align="center"
        />

        <div className="panel relative mt-12 overflow-hidden">
          <div data-divider className="pointer-events-none absolute inset-y-6 left-1/2 hidden w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,var(--color-hairline-strong),transparent)] md:block" />

          <div className="grid md:grid-cols-2">
            <div className="relative p-6 md:p-9">
              <div className="mb-7 flex items-center gap-3">
                <span className="rounded-md border border-hairline-strong bg-white/[0.05] px-2.5 py-1 text-[11px] tracking-[0.16em] text-mist uppercase">
                  antes
                </span>
                <span className="text-[13px] text-mist">o fluxo manual de triagem</span>
              </div>
              <ul className="space-y-4">
                {BEFORE.map((item) => (
                  <li key={item} data-row className="flex items-start gap-3 text-[16px] leading-relaxed text-mist">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div data-wipe className="relative border-t border-hairline bg-[linear-gradient(160deg,rgba(57,139,255,0.08),rgba(108,76,255,0.05))] p-6 md:border-t-0 md:p-9">
              <div className="mb-7 flex items-center gap-3">
                <span className="rounded-md bg-[var(--signature)] px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-white uppercase">
                  com a clickit
                </span>
                <span className="text-[13px] text-mist">o mesmo fluxo, encurtado</span>
              </div>
              <ul className="space-y-4">
                {AFTER.map((item, index) => (
                  <li
                    key={item}
                    data-row
                    className="flex items-start gap-3 text-[16px] leading-relaxed font-medium text-cloud"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--signature)]" />
                    {item}
                    <span className="ml-auto text-[11px] font-normal text-fog">{String(index + 1).padStart(2, '0')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
