'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { FeatureBadge } from '@/components/ui/Frames';

const PLAN = [
  { label: 'Temperatura', value: '+4' },
  { label: 'Contraste', value: '+12' },
  { label: 'Sombra', value: '+18' },
  { label: 'Realces', value: '-8' },
  { label: 'Vinheta', value: '+6' },
];

const FLOW = ['Perfil', 'Plano', 'Preview', 'Ajustes', 'XMP'];

const ITEMS = [
  { title: 'Perfil de edição', body: 'Questionário de estilo cria o perfil do projeto a partir do seu jeito de editar.' },
  { title: 'EditingPlan por foto', body: 'Cada fotografia recebe um plano considerando a cena e o perfil definido.' },
  { title: 'Preview não destrutivo', body: 'Before/After de cada ajuste antes de qualquer alteração real no arquivo.' },
  { title: 'Ajustes e overrides', body: 'Temperatura, contraste, sombra e realces ficam à mão, com revisão por foto.' },
  { title: 'Operações em lote', body: 'Revisões e ajustes podem ser aplicados a várias fotos de uma vez.' },
  { title: 'Exportação XMP', body: 'Sidecars XMP gerados a partir do plano revisado, para o seu fluxo de edição.' },
];

export function EditingPreview(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope, { desktop }) => {
    gsap.from(scope.querySelectorAll('[data-edit-item]'), {
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      y: 26,
      opacity: 0,
      filter: 'blur(8px)',
      duration: 0.75,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'filter',
    });

    gsap.from(scope.querySelectorAll('[data-flow-chip]'), {
      scrollTrigger: { trigger: scope, start: 'top 68%', once: true },
      y: 14,
      opacity: 0,
      scale: 0.96,
      duration: 0.5,
      stagger: 0.07,
      ease: 'back.out(1.5)',
    });

    gsap.from(scope.querySelectorAll('[data-slider]'), {
      scrollTrigger: { trigger: scope, start: 'top 62%', once: true },
      scaleX: 0,
      transformOrigin: 'left center',
      duration: 0.9,
      stagger: 0.1,
      ease: 'power3.out',
    });

    if (desktop) {
      gsap.fromTo(
        scope.querySelector('[data-edit-mock]'),
        { yPercent: 4 },
        {
          yPercent: -4,
          ease: 'none',
          scrollTrigger: { trigger: scope, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        },
      );
    }
  });

  return (
    <section id="editar" ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <SectionHeader
              eyebrow="módulo editar"
              title={['Selecione.', 'Revise.', 'E comece a editar.']}
              lead="Perfil de edição, questionário de estilo, EditingPlan, ajustes por foto, preview não destrutivo, Before/After, overrides manuais, revisão e exportação XMP — com operações em lote."
              badge={<FeatureBadge tone="good">XMP funcional</FeatureBadge>}
            />

            <ul className="mt-9 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {ITEMS.map((item) => (
                <li key={item.title} data-edit-item>
                  <h3 className="text-[15px] font-semibold text-cloud">{item.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-mist">{item.body}</p>
                </li>
              ))}
            </ul>

            <p className="mt-8 rounded-xl border border-[#d6aa65]/30 bg-[#d6aa65]/8 p-4 text-[13.5px] leading-relaxed text-[#e2c08c]">
              Compatibilidade Adobe em validação de runtime. A exportação XMP gera sidecars para fluxos compatíveis —
              não prometemos aplicação automática no Lightroom.
            </p>
          </div>

          <div data-edit-mock className="relative will-change-transform">
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-[radial-gradient(closest-side,rgba(139,77,255,0.14),transparent_75%)] blur-xl" />

            <div className="overflow-hidden rounded-2xl border border-hairline bg-ink-900 shadow-panel">
              <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
                {['Biblioteca', 'Edição', 'Exportação'].map((tab) => (
                  <span
                    key={tab}
                    className={`rounded-md px-3 py-1.5 text-[12px] ${
                      tab === 'Edição'
                        ? 'border border-azure/35 bg-gradient-to-r from-azure/18 to-violet/18 text-cloud'
                        : 'text-fog'
                    }`}
                  >
                    {tab}
                  </span>
                ))}
                <span className="ml-auto rounded-full border border-[#57c98f]/35 bg-[#57c98f]/10 px-2.5 py-1 text-[10.5px] text-[#8ee2b8]">
                  xmp pronto
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 border-b border-hairline px-4 py-3">
                {FLOW.map((step, index) => (
                  <span
                    key={step}
                    data-flow-chip
                    className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-white/[0.03] px-2 py-1 text-[10.5px] text-mist"
                  >
                    <b className="text-[9.5px] font-semibold text-signature">{index + 1}</b>
                    {step}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:p-5">
                <div>
                  <div className="rounded-xl border border-hairline bg-panel p-4">
                    <p className="eyebrow">perfil de edição</p>
                    <p className="mt-2 text-[15px] font-semibold text-cloud">Casamento · luz natural</p>
                    <p className="mt-1 text-[12.5px] text-mist">versão 3 · plano por foto</p>

                    <div className="mt-5 space-y-4">
                      {PLAN.map((row) => (
                        <div key={row.label}>
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-mist">{row.label}</span>
                            <span className="tabular-nums text-[#af9bff]">{row.value}</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
                            <div data-slider className="h-full w-full rounded-full bg-[var(--signature)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="pill">preview não destrutivo</span>
                    <span className="pill">antes / depois</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border border-hairline bg-panel p-3">
                    <p className="eyebrow mb-2">etapas</p>
                    <ol className="space-y-1.5 text-[11.5px] text-fog">
                      {['Estilo', 'Luz', 'Cor', 'Contraste', 'Textura', 'Revisão'].map((step, index) => (
                        <li
                          key={step}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                            index === 0 ? 'bg-white/[0.05] text-cloud' : ''
                          }`}
                        >
                          <span className="tabular-nums text-[10px] text-signature">{index + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="rounded-xl border border-hairline bg-panel p-3">
                    <p className="eyebrow mb-2">prévia</p>
                    <div className="relative aspect-square overflow-hidden rounded-md border border-white/[0.05]">
                      <Image
                        src="/photos/cmp-01.webp"
                        alt="Prévia não destrutiva de um retrato com ajustes aplicados"
                        fill
                        sizes="(min-width: 640px) 140px, 40vw"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white backdrop-blur-sm">
                        antes
                      </span>
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-[var(--signature)] px-1.5 py-0.5 text-[9px] font-medium text-white">
                        depois
                      </span>
                    </div>
                    <p className="mt-2 text-[10.5px] text-fog">exportação XMP</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
