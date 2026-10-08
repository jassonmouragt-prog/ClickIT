'use client';

import { type ReactNode, type RefObject } from 'react';
import { useGsapScope, gsap, parallax } from '@/lib/anim';

type Props = {
  children: ReactNode;
  className?: string;
  amount?: number;
  refTarget?: RefObject<HTMLElement | null>;
};

/** Container com parallax curto aplicado ao filho marcado por data-parallax. */
export function ParallaxMedia({ children, className = '', amount = 5 }: Props): ReactNode {
  const ref = useGsapScope<HTMLDivElement>((scope, { desktop }) => {
    if (!desktop) return;
    parallax(scope, scope.querySelector('[data-parallax]'), amount);
  });

  return (
    <div ref={ref} className={className} data-parallax-root>
      <div data-parallax className="h-full will-change-transform">
        {children}
      </div>
    </div>
  );
}

/** Linha de apoio com blur → 0, usada em blocos de texto secundário. */
export function BlurFade({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }): ReactNode {
  const ref = useGsapScope<HTMLDivElement>((scope) => {
    gsap.from(scope, {
      scrollTrigger: { trigger: scope, start: 'top 88%', once: true },
      opacity: 0,
      y: 16,
      filter: 'blur(10px)',
      duration: 0.9,
      delay,
      ease: 'power3.out',
      clearProps: 'filter',
    });
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
