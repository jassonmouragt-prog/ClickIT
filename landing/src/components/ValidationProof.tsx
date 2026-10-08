'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';

const PROOFS = [
  { value: '1.000', label: 'imagens em um lote', hint: 'pipeline validado em lotes de 100, 500 e 1.000 imagens' },
  { value: '162/162', label: 'testes passando', hint: 'suíte completa verde antes de cada liberação' },
  { value: '0', label: 'originais alterados', hint: 'exportação byte-idêntica: o arquivo sai igual ao que entrou' },
];

const CHECKS = [
  { title: 'Retomada de processamento', body: 'Se o processo parar, ele continua de onde parou sem refazer o que já terminou.' },
  { title: 'Cache persistente', body: 'O que já foi analisado não é analisado de novo ao reabrir o projeto.' },
  { title: 'DNG real validado', body: 'Um DNG de verdade passou por análise e exportação com hash idêntico.' },
  { title: 'Trial e licenciamento validados', body: 'Trial de 20 minutos, ativação e conversão testados no aplicativo real.' },
];

export function ValidationProof(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-proof]'), {
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      y: 28,
      opacity: 0,
      filter: 'blur(8px)',
      duration: 0.8,
      stagger: 0.12,
      ease: 'power3.out',
      clearProps: 'filter',
    });

    gsap.from(scope.querySelectorAll('[data-pillar]'), {
      scrollTrigger: { trigger: scope, start: 'top 70%', once: true },
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.08,
      ease: 'power3.out',
    });
  });

  return (
    <section id="provas" ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(57,139,255,0.07),transparent)]" />

      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="prova de produto"
          title={['Construída para funcionar', 'antes de ser prometida.']}
          lead="Sem depoimentos inventados: o que apresentamos aqui é o que já foi verificado no fluxo real da ClickIT."
          align="center"
        />

        <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-10">
          {PROOFS.map((proof) => (
            <div key={proof.label} data-proof className="border-t border-hairline pt-7">
              <p className="text-[clamp(40px,6vw,64px)] leading-none font-semibold tracking-[-0.05em] text-signature">
                {proof.value}
              </p>
              <p className="mt-4 text-[15px] font-medium text-cloud">{proof.label}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-mist">{proof.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {CHECKS.map((check) => (
            <article key={check.title} data-pillar className="panel p-5">
              <h3 className="text-[15px] font-semibold text-cloud">{check.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-mist">{check.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
