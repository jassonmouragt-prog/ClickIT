'use client';

import { type ElementType, type ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';

type Props = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  y?: number;
  blur?: number;
  delay?: number;
  stagger?: number;
  start?: string;
};

export function Reveal({ children, as: Tag = 'div', className, y = 26, blur = 8, delay = 0, stagger = 0.07, start }: Props): ReactNode {
  const ref = useGsapScope<HTMLHeadingElement>((scope) => {
    gsap.from(scope.children.length ? scope : scope, {
      scrollTrigger: { trigger: scope, start: start ?? 'top 84%', once: true },
      y,
      opacity: 0,
      filter: `blur(${blur}px)`,
      duration: 0.85,
      delay,
      stagger,
      ease: 'power3.out',
      clearProps: 'filter',
    });
  });

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

type LinesProps = {
  lines: string[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
  start?: string;
  as?: 'h1' | 'h2' | 'h3';
};

/** Reveal por linhas: cada linha sobe a partir de uma máscara. */
export function Lines({ lines, className, lineClassName, delay = 0, stagger = 0.09, start, as: Tag = 'h2' }: LinesProps): ReactNode {
  const ref = useGsapScope<HTMLHeadingElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-line]'), {
      scrollTrigger: { trigger: scope, start: start ?? 'top 86%', once: true },
      yPercent: 108,
      opacity: 0,
      duration: 1,
      delay,
      stagger,
      ease: 'power4.out',
    });
  });

  return (
    <Tag ref={ref} className={className}>
      {lines.map((line) => (
        <span key={line} className="block overflow-hidden pb-[0.08em]">
          <span data-line className={`block ${lineClassName ?? ''}`}>
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
