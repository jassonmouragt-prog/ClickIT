'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { HERO_GRID } from '@/lib/photos';

const GROUPS = [
  { label: 'Sequência 12', count: '4 fotos', shots: HERO_GRID.slice(0, 4) },
  { label: 'Sequência 13', count: '4 fotos', shots: HERO_GRID.slice(4, 8) },
  { label: 'Sequência 14', count: '4 fotos', shots: HERO_GRID.slice(8, 12) },
];

export function PainSection(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope, { desktop }) => {
    const cells = scope.querySelectorAll('[data-cell]');
    const labels = scope.querySelectorAll('[data-group-label]');
    const verdict = scope.querySelector('[data-verdict]');

    const scatter = gsap.utils.random;

    gsap.from(cells, {
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      x: () => scatter(-90, 90),
      y: () => scatter(-60, 80),
      rotate: () => scatter(-7, 7),
      scale: 0.9,
      opacity: 0,
      duration: 0.9,
      stagger: { each: 0.035, from: 'random' },
      ease: 'power3.out',
    });

    gsap.to(cells, {
      scrollTrigger: { trigger: scope, start: 'top 46%', once: true },
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      duration: desktop ? 0.9 : 0.6,
      stagger: 0.02,
      ease: 'power4.inOut',
    });

    gsap.from(labels, {
      scrollTrigger: { trigger: scope, start: 'top 44%', once: true },
      y: 12,
      opacity: 0,
      duration: 0.7,
      stagger: 0.12,
      ease: 'power3.out',
    });

    if (verdict) {
      gsap.from(verdict, {
        scrollTrigger: { trigger: scope, start: 'top 34%', once: true },
        y: 14,
        opacity: 0,
        filter: 'blur(8px)',
        duration: 0.8,
        ease: 'power3.out',
        clearProps: 'filter',
      });
    }
  });

  return (
    <section id="dor" ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="a dor de quem fotografa"
          title={['O ensaio termina.', 'A triagem começa.']}
          lead="Centenas de fotos. Sequências quase iguais. Olhos fechados. Pequenas diferenças de foco. E decisões repetidas por horas."
          className="max-w-4xl"
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {GROUPS.map((group) => (
            <div key={group.label} className="panel p-3 sm:p-4">
              <div data-group-label className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-medium text-cloud">{group.label}</span>
                <span className="text-[11px] text-fog">{group.count}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.shots.map((shot) => (
                  <div key={shot.name} data-cell className="relative aspect-[4/3] overflow-hidden rounded-lg border border-white/[0.05] bg-panel">
                    <Image
                      src={shot.src}
                      alt={shot.alt}
                      fill
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                      loading="lazy"
                      className="h-full w-full object-cover opacity-90"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div data-verdict className="mt-8 flex flex-col items-start gap-4 border-t border-hairline pt-8 sm:flex-row sm:items-center">
          <span className="pill shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            depois da análise
          </span>
          <p className="text-[16px] leading-relaxed text-mist md:text-[17px]">
            <span className="text-cloud">A ClickIT transforma esse caos em uma seleção organizada.</span> Grupos
            formados, falhas sinalizadas e as candidatas mais fortes já em destaque.
          </p>
        </div>
      </div>
    </section>
  );
}
