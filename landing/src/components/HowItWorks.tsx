'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';

const STEPS = [
  {
    title: 'Importe',
    body: 'Escolha a pasta do trabalho. A ClickIT prepara o projeto localmente.',
    tags: ['pasta local', 'projeto local'],
  },
  {
    title: 'Analise',
    body: 'A ClickIT compara similaridade, nitidez, exposição, rostos e olhos.',
    tags: ['lote', 'comparação'],
  },
  {
    title: 'Receba os Picks',
    body: 'As melhores candidatas de cada sequência ganham prioridade.',
    tags: ['ranking', 'destaque'],
  },
  {
    title: 'Revise',
    body: 'Compare, favorite, dê estrelas, rejeite e finalize sua seleção.',
    tags: ['controle humano', 'exportação'],
  },
];

const FLOW = ['pasta', 'análise', 'grupos', 'picks', 'revisão'];

export function HowItWorks(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope, { desktop }) => {
    gsap.from(scope.querySelectorAll('[data-step]'), {
      scrollTrigger: { trigger: scope, start: 'top 76%', once: true },
      y: 34,
      opacity: 0,
      filter: 'blur(8px)',
      duration: 0.85,
      stagger: 0.12,
      ease: 'power3.out',
      clearProps: 'filter',
    });

    const flow = scope.querySelector('[data-flow]');
    const line = scope.querySelector('[data-flow-line]');
    const nodes = scope.querySelectorAll('[data-flow-node]');
    if (!flow || !line) return;

    if (desktop) {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: flow, start: 'top 20%', end: '+=70%', scrub: 0.5, pin: true, anticipatePin: 1 },
      });

      tl.fromTo(line, { scaleY: 0, transformOrigin: 'top center' }, { scaleY: 1, ease: 'none', duration: FLOW.length });

      nodes.forEach((node, index) => {
        tl.to(
          node,
          {
            borderColor: 'rgba(57,139,255,0.75)',
            backgroundColor: 'rgba(57,139,255,0.14)',
            color: '#ffffff',
            scale: 1.12,
            duration: 0.35,
            ease: 'power2.out',
          },
          index,
        );
        tl.to(node.querySelector('[data-flow-label]'), { color: '#f5f7fb', duration: 0.35 }, index);
      });
    } else {
      gsap.fromTo(
        line,
        { scaleY: 0, transformOrigin: 'top center' },
        {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: { trigger: flow, start: 'top 78%', end: 'bottom 70%', scrub: 0.5 },
        },
      );

      gsap.from(nodes, {
        scrollTrigger: { trigger: flow, start: 'top 78%', once: true },
        opacity: 0,
        y: 16,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power3.out',
      });
    }
  });

  return (
    <section id="como-funciona" ref={ref} className="relative py-24 md:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(57,139,255,0.07),transparent)]" />

      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="como funciona"
          title={['Da pasta cheia à', 'seleção organizada.']}
          lead="Quatro etapas. Nenhuma delas exige que você abra foto por foto para descobrir por onde começar."
          align="center"
        />

        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {STEPS.map((step, index) => (
            <li key={step.title} data-step className="panel relative flex flex-col p-6">
              <span className="text-[13px] font-semibold tracking-[0.18em] text-signature">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-[19px] leading-snug font-semibold tracking-[-0.02em] text-cloud">{step.title}</h3>
              <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-mist">{step.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {step.tags.map((tag) => (
                  <span key={tag} className="rounded-md border border-hairline bg-white/[0.03] px-2 py-1 text-[11px] text-fog">
                    {tag}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <div
          data-flow
          className="relative mt-10 rounded-2xl border border-hairline bg-white/[0.02] px-5 py-7 md:mt-12 md:px-8 md:py-8"
        >
          <p className="eyebrow mb-6 text-center">o que acontece com a sua pasta</p>

          <div className="relative mx-auto max-w-2xl">
            <div className="absolute top-0 bottom-0 left-[13px] w-px bg-hairline" />
            <div data-flow-line className="absolute top-0 bottom-0 left-[13px] w-px bg-[var(--signature)]" />

            <ol className="relative flex flex-col gap-5 md:gap-6">
              {FLOW.map((node, index) => (
                <li key={node} data-flow-node className="flex items-center gap-5">
                  <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border border-hairline bg-ink-900 text-[10px] font-semibold text-mist transition-colors duration-300">
                    {index + 1}
                  </span>
                  <span
                    data-flow-label
                    className="text-[12px] tracking-[0.2em] text-fog uppercase transition-colors duration-300"
                  >
                    {node}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
