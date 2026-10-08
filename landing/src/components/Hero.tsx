'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { HeroApp } from '@/components/HeroApp';

type Line = { text: string; accent?: string };

/** "horas" é a palavra que carrega a dor — recebe o gradiente assinatura. */
const TITLE_LINES: Line[] = [
  { text: 'Pare de perder' },
  { text: 'horas escolhendo', accent: 'horas' },
  { text: 'fotos.' },
];

function renderLine({ text, accent }: Line): ReactNode {
  if (!accent || !text.includes(accent)) return text;

  const [before, after] = text.split(accent);
  return (
    <>
      {before}
      <span className="bg-[linear-gradient(100deg,#27c8f5,#398bff_45%,#8b4dff)] bg-clip-text text-transparent">
        {accent}
      </span>
      {after}
    </>
  );
}

export function Hero(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope, { desktop }) => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from(scope.querySelector('[data-hero-eyebrow]'), { y: 14, opacity: 0, duration: 0.7 })
      .from(scope.querySelectorAll('[data-hero-title] [data-line]'), { yPercent: 112, opacity: 0, duration: 1, stagger: 0.1 }, '-=0.4')
      .from(scope.querySelector('[data-hero-lead]'), { y: 18, opacity: 0, filter: 'blur(10px)', duration: 0.9, clearProps: 'filter' }, '-=0.6')
      .from(scope.querySelector('[data-hero-support]'), { y: 14, opacity: 0, duration: 0.7 }, '-=0.6')
      .from(scope.querySelectorAll('[data-hero-cta]'), { y: 16, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.5')
      .from(scope.querySelector('[data-hero-micro]'), { y: 10, opacity: 0, duration: 0.6 }, '-=0.4');

    if (desktop) {
      gsap.to(scope.querySelector('[data-hero-copy]'), {
        yPercent: -6,
        ease: 'none',
        scrollTrigger: { trigger: scope, start: 'top top', end: 'bottom top', scrub: 0.5 },
      });
    }
  });

  return (
    <section id="topo" ref={ref} className="relative overflow-hidden pt-28 md:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-220px] left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(108,76,255,0.18),transparent_75%)]" />
        <div className="absolute top-[120px] right-[-160px] h-[420px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(39,200,245,0.12),transparent_75%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,166,183,0.25),transparent)]" />
      </div>

      <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 pb-24 md:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12 lg:pb-32">
        <div data-hero-copy className="text-center lg:text-left">
          <p data-hero-eyebrow className="eyebrow mb-6">
            seleção inteligente para fotógrafos
          </p>

          <h1
            data-hero-title
            className="text-[clamp(38px,6.4vw,72px)] leading-[0.98] font-semibold tracking-[-0.045em]"
          >
            {TITLE_LINES.map((line) => (
              <span key={line.text} className="block overflow-hidden pb-[0.06em]">
                <span
                  data-line
                  className="block bg-clip-text text-transparent bg-[linear-gradient(180deg,#ffffff_38%,#b9c4d6)]"
                >
                  {renderLine(line)}
                </span>
              </span>
            ))}
          </h1>

          <p data-hero-lead className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-mist lg:mx-0">
            A ClickIT analisa seu ensaio, organiza sequências, identifica possíveis falhas e sugere os melhores cliques
            para você revisar muito mais rápido.
          </p>

          <p data-hero-support className="mt-5 text-[15px] leading-relaxed text-fog">
            Você continua no controle. <span className="text-cloud">A ClickIT faz o trabalho pesado.</span>
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a data-hero-cta href="/#trial" className="btn-primary w-full sm:w-auto">
              Testar grátis por 20 minutos
            </a>
            <a data-hero-cta href="/#como-funciona" className="btn-ghost w-full sm:w-auto">
              Ver como funciona
            </a>
          </div>

          <p data-hero-micro className="mt-7 flex items-center justify-center gap-2 text-[13px] text-fog lg:justify-start">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 9.7 4.1-1.3 7-5.3 7-9.7V6l-7-3Z" />
              <path d="m9 12 2.2 2.2L15.5 10" />
            </svg>
            Processamento local · Seus arquivos permanecem no seu computador
          </p>
        </div>

        <div className="relative lg:pl-2">
          <div className="pointer-events-none absolute -top-8 -left-6 hidden h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(39,200,245,0.14),transparent)] blur-xl lg:block" />
          <HeroApp />
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 pb-6 md:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-hairline pt-6 text-[12px] tracking-[0.14em] text-fog uppercase lg:justify-start">
          <span>análise local</span>
          <span aria-hidden="true">·</span>
          <span>ClickIT Picks</span>
          <span aria-hidden="true">·</span>
          <span>comparação lado a lado</span>
          <span aria-hidden="true">·</span>
          <span>exportação dos originais</span>
        </div>
      </div>
    </section>
  );
}

export default Hero;
