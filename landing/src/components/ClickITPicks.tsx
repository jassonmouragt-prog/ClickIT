'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { PICK_GROUP, type PickCard } from '@/lib/photos';

const TONE_RING: Record<PickCard['tone'], string> = {
  neutral: 'border-white/[0.06]',
  warn: 'border-[#d6aa65]/45',
  blur: 'border-[#d6aa65]/45',
  pick: 'border-azure/60',
  alt: 'border-hairline',
};

const TONE_CHIP: Record<PickCard['tone'], string> = {
  neutral: 'bg-white/[0.05] text-mist',
  warn: 'bg-[#d6aa65]/12 text-[#e2c08c]',
  blur: 'bg-[#d6aa65]/12 text-[#e2c08c]',
  pick: 'bg-[var(--signature)] text-white',
  alt: 'bg-white/[0.05] text-mist',
};

export function ClickITPicks(): ReactNode {
  const [active, setActive] = useState(3);
  const selected = PICK_GROUP[active] ?? PICK_GROUP[0]!;

  const ref = useGsapScope<HTMLElement>((scope) => {
    const cards = scope.querySelectorAll('[data-pick-card]');
    gsap.from(cards, {
      scrollTrigger: { trigger: scope, start: 'top 74%', once: true },
      y: 40,
      opacity: 0,
      scale: 0.96,
      filter: 'blur(8px)',
      duration: 0.85,
      stagger: 0.09,
      ease: 'power3.out',
      clearProps: 'filter',
    });

    gsap.from(scope.querySelector('[data-pick-detail]'), {
      scrollTrigger: { trigger: scope, start: 'top 55%', once: true },
      y: 24,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
    });
  });

  return (
    <section id="picks" ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="clickit picks"
          title={['A ClickIT não escolhe por você.', 'Ela mostra onde vale olhar primeiro.']}
          lead="A ferramenta analisa as diferenças técnicas e estéticas entre fotos semelhantes e cria uma ordem de prioridade."
          className="max-w-4xl"
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-2.5">
              {PICK_GROUP.map((card, index) => {
                const isActive = index === active;
                return (
                  <button
                    key={card.name}
                    type="button"
                    data-pick-card
                    aria-pressed={isActive}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onClick={() => setActive(index)}
                    className={`group relative overflow-hidden rounded-xl border bg-panel p-1.5 text-left transition-[border-color,transform] duration-300 ${
                      isActive ? `${TONE_RING[card.tone]} -translate-y-1` : 'border-white/[0.06]'
                    }`}
                  >
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-lg">
                      <Image
                        src={card.src}
                        alt={card.alt}
                        fill
                        sizes="(min-width: 640px) 18vw, 45vw"
                        loading="lazy"
                        className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05] ${
                          isActive ? '' : 'brightness-90 saturate-[0.92]'
                        }`}
                      />
                      {card.tone === 'pick' ? (
                        <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-[var(--signature)] px-1.5 py-1 text-center text-[10px] font-semibold text-white">
                          ClickIT Pick
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block px-1 pb-1">
                      <span className="block truncate text-[11px] text-fog">{card.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p data-pick-detail className="mt-5 text-[13.5px] leading-relaxed text-fog">
              Passe o mouse (ou toque) em cada foto para ver o que a análise sinalizou. A ordem é uma sugestão: você pode
              trocar o Pick a qualquer momento.
            </p>
          </div>

          <aside className="panel flex flex-col p-6" data-pick-detail>
            <span className={`self-start rounded-md px-2.5 py-1 text-[11px] font-medium ${TONE_CHIP[selected.tone]}`}>
              {selected.verdict}
            </span>
            <p className="mt-4 text-[13px] text-fog">{selected.name}</p>
            <p className="mt-3 text-[16px] leading-relaxed text-cloud">{selected.note}</p>

            <div className="mt-6 space-y-3 border-t border-hairline pt-5 text-[13px] text-mist">
              <div className="flex items-center justify-between">
                <span>ordem sugerida</span>
                <span className="tabular-nums text-cloud">
                  {active + 1} de {PICK_GROUP.length}
                </span>
              </div>
              <div className="flex gap-1.5">
                {PICK_GROUP.map((card, index) => (
                  <span
                    key={card.name}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                      index <= active ? 'bg-[var(--signature)]' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="pill">ranking técnico</span>
              <span className="pill">ranking estético</span>
              <span className="pill">similaridade</span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
