'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { FeatureBadge } from '@/components/ui/Frames';

const FORMATS = [
  { name: 'DNG', state: 'validado', tone: 'good' as const, detail: 'Leitura, análise e exportação byte-idêntica verificadas.' },
  { name: 'JPEG', state: 'validado', tone: 'good' as const, detail: 'Formato principal do fluxo de seleção.' },
  { name: 'CR2', state: 'em validação', tone: 'neutral' as const, detail: 'Suporte em expansão.' },
  { name: 'CR3', state: 'em validação', tone: 'neutral' as const, detail: 'Suporte em expansão.' },
  { name: 'NEF', state: 'em validação', tone: 'neutral' as const, detail: 'Suporte em expansão.' },
  { name: 'ARW', state: 'em validação', tone: 'neutral' as const, detail: 'Suporte em expansão.' },
];

export function RawSupport(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-format]'), {
      scrollTrigger: { trigger: scope, start: 'top 78%', once: true },
      y: 22,
      opacity: 0,
      duration: 0.6,
      stagger: 0.06,
      ease: 'power3.out',
    });
  });

  return (
    <section id="formatos" ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <SectionHeader
            eyebrow="formatos de arquivo"
            title={['DNG validado.', 'RAW em expansão.']}
            lead="Suportamos os formatos que já passaram por validação real e estamos expandindo o restante com o mesmo rigor. Nada de promessa genérica."
          >
            <div className="mt-7 flex flex-wrap gap-2.5">
              <span className="pill">originais preservados</span>
              <span className="pill">só leitura na análise</span>
            </div>
          </SectionHeader>

          <div className="panel p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="eyebrow">compatibilidade</span>
              <span className="text-[11px] text-fog">atualizado conforme a validação</span>
            </div>

            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FORMATS.map((format) => (
                <li
                  key={format.name}
                  data-format
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-white/[0.02] px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-cloud">{format.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-fog">{format.detail}</p>
                  </div>
                  <FeatureBadge tone={format.tone}>{format.state}</FeatureBadge>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[12.5px] leading-relaxed text-fog">
              CR2, CR3, NEF e ARW seguem em validação. A lista é atualizada a cada formato aprovado — sem anunciar
              compatibilidade que ainda não foi verificada.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
