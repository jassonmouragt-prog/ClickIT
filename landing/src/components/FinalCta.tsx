'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { LogoMark } from '@/components/Logo';
import { AnimatedHeading } from '@/components/ui/AnimatedHeading';

export function FinalCta(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: scope, start: 'top 72%', once: true },
      defaults: { ease: 'power3.out' },
    });

    tl.from(scope.querySelector('[data-cta-sub]'), { y: 18, opacity: 0, filter: 'blur(8px)', duration: 0.8, clearProps: 'filter' }).from(
      scope.querySelectorAll('[data-cta-btn]'),
      { y: 16, opacity: 0, duration: 0.6, stagger: 0.1 },
      '-=0.45',
    );
  });

  return (
    <section id="contato" ref={ref} className="relative overflow-hidden py-28 md:py-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-1/2 h-[420px] -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(57,139,255,0.14),transparent_78%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,166,183,0.25),transparent)]" />
      </div>

      <div className="mx-auto max-w-[1240px] px-5 text-center md:px-8">
        <span className="mx-auto mb-9 flex h-12 w-12 items-center justify-center rounded-2xl border border-hairline bg-white/[0.03]">
          <LogoMark className="h-6 w-6" />
        </span>

        <AnimatedHeading
          as="h2"
          lines={[
            { text: 'Menos tempo selecionando.' },
            { text: 'Mais tempo fotografando.', accent: 'Mais tempo fotografando.' },
          ]}
          start="top 78%"
          stagger={0.12}
          className="mx-auto max-w-4xl text-[clamp(32px,5.6vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em]"
        />

        <p data-cta-sub className="mx-auto mt-7 max-w-2xl text-[17px] leading-relaxed text-mist">
          Deixe a ClickIT organizar o trabalho pesado da triagem enquanto você mantém o controle criativo.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a data-cta-btn href="/#trial" className="btn-primary w-full sm:w-auto">
            Testar por 20 minutos
          </a>
          <a data-cta-btn href="/checkout" className="btn-ghost w-full sm:w-auto">
            Comprar ClickIT
          </a>
        </div>
      </div>
    </section>
  );
}
