'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { FeatureBadge } from '@/components/ui/Frames';

const SIGNALS = [
  { file: 'DSC_4822', label: 'Olhos fechados', tone: 'warn' as const },
  { file: 'DSC_4823', label: 'Possível desfoque', tone: 'warn' as const },
  { file: 'DSC_4829', label: 'Sequência semelhante', tone: 'neutral' as const },
  { file: 'DSC_4831', label: 'Duplicada', tone: 'neutral' as const },
  { file: 'DSC_4834', label: 'Exposição fora do padrão', tone: 'warn' as const },
  { file: 'DSC_4840', label: 'ClickIT Pick', tone: 'good' as const },
];

const BLOCKS = [
  {
    title: 'ClickIT Picks',
    body: 'As melhores candidatas de cada sequência ganham prioridade e aparecem primeiro.',
    items: ['Picks por sequência', 'Substituição livre', 'Ordem de prioridade'],
  },
  {
    title: 'Fotos semelhantes',
    body: 'Sequências parecidas são agrupadas para você comparar sem pular entre pastas.',
    items: ['Agrupamento automático', 'Comparação lado a lado'],
  },
  {
    title: 'Possíveis falhas',
    body: 'Sinais técnicos apontam o que merece atenção antes de você abrir a foto.',
    items: ['Olhos fechados', 'Possível desfoque', 'Nitidez', 'Exposição', 'Detecção de rosto'],
  },
  {
    title: 'Ranking',
    body: 'Duas leituras — técnica e estética — para construir a ordem de prioridade.',
    items: ['Ranking técnico', 'Ranking estético'],
  },
  {
    title: 'Revisão',
    body: 'Tudo o que você precisa para transformar a sugestão na sua seleção final.',
    items: ['Favoritas', 'Estrelas', 'Rejeitadas', 'Filtros'],
  },
  {
    title: 'Projeto persistente',
    body: 'O trabalho fica salvo: você fecha e continua de onde parou.',
    items: ['Cache', 'Retomada', 'Exportação do original'],
  },
];

export function DetectionFeatures(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-signal]'), {
      scrollTrigger: { trigger: scope, start: 'top 72%', once: true },
      x: 22,
      opacity: 0,
      duration: 0.6,
      stagger: 0.09,
      ease: 'power3.out',
    });

    gsap.from(scope.querySelectorAll('[data-feature]'), {
      scrollTrigger: { trigger: scope, start: 'top 66%', once: true },
      y: 26,
      opacity: 0,
      filter: 'blur(6px)',
      duration: 0.7,
      stagger: 0.07,
      ease: 'power3.out',
      clearProps: 'filter',
    });
  });

  return (
    <section id="recursos" ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-14">
          <SectionHeader
            eyebrow="recursos"
            title={['Menos tempo', 'procurando problemas.']}
            lead="A ClickIT identifica padrões, sinaliza o que merece atenção e sugere por onde começar. Ela não promete perfeição: entrega contexto para você decidir com mais segurança."
          >
            <div className="mt-8 flex flex-wrap gap-2.5">
              <span className="pill">identifica</span>
              <span className="pill">sinaliza</span>
              <span className="pill">sugere</span>
            </div>
          </SectionHeader>

          <div className="panel p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="eyebrow">sinais da análise</span>
              <span className="text-[11px] text-fog">local · em lote</span>
            </div>
            <ul className="space-y-2.5">
              {SIGNALS.map((signal) => (
                <li
                  key={signal.file}
                  data-signal
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-white/[0.02] px-3 py-2.5"
                >
                  <span className="truncate text-[12.5px] text-mist">{signal.file}</span>
                  <FeatureBadge tone={signal.tone}>{signal.label}</FeatureBadge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] leading-relaxed text-fog">
              Sinais são sugestões de atenção, não vereditos. Tudo pode ser revisado, dispensado ou mantido por você.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:gap-5">
          {BLOCKS.map((block) => (
            <article
              key={block.title}
              data-feature
              className="panel flex flex-col p-6 transition-colors duration-300 hover:border-hairline-strong md:p-7"
            >
              <div className="mb-4 h-px w-10 bg-[var(--signature)]" />
              <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-cloud">{block.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-mist">{block.body}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {block.items.map((item) => (
                  <li key={item} className="rounded-md border border-hairline bg-white/[0.03] px-2.5 py-1 text-[12px] text-fog">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
