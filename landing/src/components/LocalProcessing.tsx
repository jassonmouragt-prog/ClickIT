'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';

const MODULES = [
  { title: 'DINOv2', body: 'Similaridade e embeddings calculados na sua máquina.' },
  { title: 'Face analysis', body: 'Rostos e olhos analisados localmente, sem envio de arquivos.' },
  { title: 'NIMA', body: 'Leitura de qualidade estética por imagem, também local.' },
  { title: 'Local cache', body: 'Resultados salvos no projeto: repetir uma etapa não começa do zero.' },
];

const PIPELINE = ['ClickIT Desktop', 'modelos locais', 'resultados'];

const NOTES = [
  'O processamento principal acontece localmente.',
  'Você não precisa enviar todo o ensaio para uma nuvem para começar a trabalhar.',
  'Projetos locais, cache e retomada preservam o trabalho já feito.',
  'Os originais são preservados em todo o fluxo.',
];

export function LocalProcessing(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-module]'), {
      scrollTrigger: { trigger: scope, start: 'top 72%', once: true },
      y: 26,
      opacity: 0,
      duration: 0.7,
      stagger: 0.1,
      ease: 'power3.out',
    });

    gsap.from(scope.querySelectorAll('[data-note]'), {
      scrollTrigger: { trigger: scope, start: 'top 68%', once: true },
      x: -16,
      opacity: 0,
      duration: 0.6,
      stagger: 0.09,
      ease: 'power3.out',
    });

    const dot = scope.querySelector('[data-dot]');
    if (dot) {
      gsap.fromTo(
        dot,
        { x: 0 },
        {
          x: 300,
          duration: 3.4,
          ease: 'power1.inOut',
          repeat: -1,
          yoyo: true,
          scrollTrigger: { trigger: scope, start: 'top 75%', end: 'bottom top', toggleActions: 'play pause resume pause' },
        },
      );
    }
  });

  return (
    <section ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <div>
            <SectionHeader
              eyebrow="processamento local"
              title={['Suas fotografias', 'permanecem no seu computador.']}
              lead="O processamento principal acontece localmente. Você não precisa enviar todo o ensaio para uma nuvem para começar a trabalhar."
            />

            <ul className="mt-9 space-y-3.5">
              {NOTES.map((note) => (
                <li key={note} data-note className="flex items-start gap-3 text-[15px] leading-relaxed text-mist">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 9.7 4.1-1.3 7-5.3 7-9.7V6l-7-3Z" />
                  </svg>
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative rounded-2xl border border-dashed border-hairline-strong bg-ink-900 p-5 shadow-panel md:p-7">
            <div className="mb-6 flex items-center justify-between">
              <span className="eyebrow">seu computador</span>
              <span className="text-[11px] text-fog">sem upload do ensaio</span>
            </div>

            <div className="flex flex-col items-center gap-3">
              <span className="w-full rounded-xl border border-azure/30 bg-gradient-to-r from-azure/15 to-violet/15 px-4 py-3 text-center text-[13px] font-semibold tracking-[0.14em] text-cloud uppercase">
                {PIPELINE[0]}
              </span>

              <span className="text-[14px] text-fog" aria-hidden="true">
                ↓
              </span>

              <div className="grid w-full gap-3 sm:grid-cols-2">
                {MODULES.map((module) => (
                  <div key={module.title} data-module className="rounded-xl border border-hairline bg-panel p-4">
                    <p className="text-[13px] font-semibold tracking-[-0.01em] text-cloud">{module.title}</p>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-mist">{module.body}</p>
                  </div>
                ))}
              </div>

              <span className="text-[14px] text-fog" aria-hidden="true">
                ↓
              </span>

              <span className="w-full rounded-xl border border-hairline bg-white/[0.03] px-4 py-3 text-center text-[13px] font-semibold tracking-[0.14em] text-cloud uppercase">
                {PIPELINE[2]}
              </span>
            </div>

            <div className="relative mt-6 h-8 overflow-hidden rounded-lg border border-hairline bg-white/[0.02]">
              <div className="absolute inset-y-0 left-4 flex items-center text-[10.5px] tracking-[0.16em] text-fog uppercase">
                projeto local
              </div>
              <span data-dot className="absolute top-1/2 left-16 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--signature)] shadow-[0_0_14px_rgba(57,139,255,0.9)]" />
              <div className="absolute inset-y-0 right-4 flex items-center text-[10.5px] tracking-[0.16em] text-fog uppercase">
                cache · retomada
              </div>
            </div>

            <p className="mt-5 text-[12.5px] leading-relaxed text-fog">
              Modelos e resultados ficam no ambiente local. A ativação da licença é a única etapa que depende de
              validação; depois dela, o uso segue conforme a licença.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
