'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader, GradientButton } from '@/components/ui/Actions';
import { DOWNLOAD_URL, TRIAL_MINUTES } from '@/config/product';

const BENEFITS = [
  { title: 'Sem cartão de crédito', body: 'Você baixa e usa. Nenhuma cobrança é feita para começar.' },
  { title: 'Acesso completo ao workspace', body: 'Mesma experiência da licença: projeto, análise, Picks e revisão.' },
  { title: 'Seus projetos permanecem salvos', body: 'O que você criar durante o teste continua lá depois.' },
  { title: 'Compra sem reinstalar', body: 'Ao comprar, basta inserir a licença na mesma instalação.' },
  { title: '20 minutos no seu computador', body: 'Tempo suficiente para importar um ensaio real e ver a triagem rodar.' },
];

export function Trial(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      defaults: { ease: 'power3.out' },
    });

    tl.from(scope.querySelector('[data-trial-card]'), {
      y: 34,
      opacity: 0,
      scale: 0.985,
      filter: 'blur(10px)',
      duration: 0.9,
      clearProps: 'filter',
    }).from(
      scope.querySelectorAll('[data-trial-benefit]'),
      { y: 20, opacity: 0, duration: 0.6, stagger: 0.08 },
      '-=0.5',
    );
  });

  return (
    <section id="trial" ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(155,166,183,0.25),transparent)]" />
        <div className="absolute top-1/2 left-1/2 h-[460px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(39,200,245,0.12),transparent_75%)]" />
      </div>

      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow={`teste gratuito · ${TRIAL_MINUTES} minutos`}
          title={['Experimente antes', 'de decidir.']}
          lead={`Instale a ClickIT e use a experiência completa por ${TRIAL_MINUTES} minutos neste computador.`}
          align="center"
        />

        <div
          data-trial-card
          className="relative mx-auto mt-12 max-w-4xl overflow-hidden rounded-3xl border border-hairline bg-[linear-gradient(165deg,rgba(20,26,37,0.96),rgba(10,14,21,0.96))] p-7 shadow-panel md:p-10"
        >
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(108,76,255,0.2),transparent_75%)] blur-2xl" />

          <div className="grid grid-cols-1 gap-9 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:gap-12">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-[var(--signature)] px-3 py-1.5 text-[12px] font-semibold text-white">
                  {TRIAL_MINUTES} minutos
                </span>
                <span className="pill">sem cartão</span>
                <span className="pill">instalação local</span>
              </div>

              <h3 className="mt-6 text-[clamp(24px,3.2vw,34px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
                O trial roda no seu computador, com seus arquivos.
              </h3>

              <ul className="mt-6 grid gap-3.5">
                {BENEFITS.map((benefit) => (
                  <li key={benefit.title} data-trial-benefit className="flex items-start gap-3">
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
                    <span>
                      <span className="text-[15px] font-medium text-cloud">{benefit.title}</span>
                      <span className="mt-0.5 block text-[14px] leading-relaxed text-mist">{benefit.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col justify-between gap-6 rounded-2xl border border-hairline bg-white/[0.03] p-6">
              <div>
                <p className="eyebrow">comece agora</p>
                <p className="mt-3 text-[17px] leading-snug font-medium text-cloud">
                  {DOWNLOAD_URL ? 'Baixe a ClickIT para Windows.' : 'O download está sendo preparado.'}
                </p>
                <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                  {DOWNLOAD_URL
                    ? 'Abra o instalador, inicie o trial e importe um ensaio real para ver a triagem rodando.'
                    : 'Assim que o instalador estiver publicado, o botão abaixo libera o acesso imediato ao trial de 20 minutos.'}
                </p>
              </div>

              <div>
                {DOWNLOAD_URL ? (
                  <GradientButton href={DOWNLOAD_URL} className="w-full">
                    Testar grátis por {TRIAL_MINUTES} minutos
                  </GradientButton>
                ) : (
                  <button type="button" className="btn-primary w-full cursor-not-allowed opacity-80" aria-disabled="true">
                    Testar grátis por {TRIAL_MINUTES} minutos
                  </button>
                )}

                <p className="mt-3 text-center text-[12.5px] leading-relaxed text-fog">
                  {DOWNLOAD_URL ? 'Sem cartão · sem compromisso' : 'Disponível em breve'}
                </p>

                <p className="mt-4 border-t border-hairline pt-4 text-center text-[13px] leading-relaxed text-mist">
                  Prefere comprar de uma vez?{' '}
                  <a href="/checkout" className="text-cloud underline decoration-hairline-strong underline-offset-4 transition-colors hover:decoration-azure">
                    Comprar ClickIT
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
