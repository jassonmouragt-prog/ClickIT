'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';
import { AUDIENCE } from '@/lib/photos';

export function Audience(): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-audience]'), {
      scrollTrigger: { trigger: scope, start: 'top 78%', once: true },
      y: 22,
      opacity: 0,
      duration: 0.65,
      stagger: 0.07,
      ease: 'power3.out',
    });
  });

  return (
    <section ref={ref} className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="para quem é"
          title={['Voltou do trabalho', 'com centenas de fotos?']}
          lead="Se você volta de um trabalho com centenas ou milhares de fotografias, a ClickIT foi pensada para esse fluxo."
          align="center"
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {AUDIENCE.map((item) => (
            <article
              key={item.title}
              data-audience
              className="panel group p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--signature)] transition-transform duration-300 group-hover:scale-150" />
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-cloud">{item.title}</h3>
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-mist">{item.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
