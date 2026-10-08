'use client';

import { useRef, type ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { SectionHeader } from '@/components/ui/Actions';

const TIERS = [100, 500, 1000];

export function ScaleSection(): ReactNode {
  const refs = useRef<Array<HTMLSpanElement | null>>([]);

  const ref = useGsapScope<HTMLElement>((scope) => {
    const nodes = refs.current.filter((node): node is HTMLSpanElement => Boolean(node));

    const counters = nodes.map((node, index) => ({ node, target: TIERS[index] ?? 0, value: 0 }));

    gsap.to(counters, {
      value: 1,
      duration: 1.5,
      stagger: 0.25,
      ease: 'power2.out',
      scrollTrigger: { trigger: scope, start: 'top 70%', once: true },
      onUpdate() {
        for (const counter of counters) {
          counter.node.textContent = Math.round(counter.target * counter.value).toLocaleString('pt-BR');
        }
      },
    });

    gsap.from(scope.querySelectorAll('[data-tier]'), {
      scrollTrigger: { trigger: scope, start: 'top 72%', once: true },
      y: 30,
      opacity: 0,
      duration: 0.8,
      stagger: 0.14,
      ease: 'power3.out',
    });

    gsap.from(scope.querySelectorAll('[data-cap]'), {
      scrollTrigger: { trigger: scope, start: 'top 66%', once: true },
      y: 18,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
    });
  });

  return (
    <section ref={ref} className="relative overflow-hidden py-24 md:py-32">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        <SectionHeader
          eyebrow="escala"
          title={['Feita para trabalhos', 'de verdade.']}
          lead="Pipeline validado em lotes de 100, 500 e 1.000 imagens."
          align="center"
        />

        <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-10">
          {TIERS.map((tier, index) => (
            <div key={tier} data-tier className="relative border-t border-hairline pt-7 text-center">
              <span
                ref={(node) => {
                  refs.current[index] = node;
                }}
                className="block text-[clamp(52px,8vw,86px)] leading-none font-semibold tracking-[-0.05em] text-signature"
              >
                {tier.toLocaleString('pt-BR')}
              </span>
              <p className="mt-4 text-[14px] tracking-[0.16em] text-fog uppercase">imagens por lote</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl text-center">
          <p className="text-[16px] leading-relaxed text-mist md:text-[17px]">
            A ClickIT mantém cache e progresso para que você não precise começar novamente toda vez que abrir o
            projeto.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {['cache quente', 'retomada automática', 'análise persistente', 'projetos locais'].map((item) => (
            <span key={item} data-cap className="pill">
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
