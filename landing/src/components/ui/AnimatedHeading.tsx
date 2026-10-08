'use client';

import type { ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';

export type HeadingLine = { text: string; accent?: string };

type Props = {
  lines: string[] | HeadingLine[];
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  lineClassName?: string;
  accentClassName?: string;
  start?: string;
  delay?: number;
  stagger?: number;
};

function toLine(input: string | HeadingLine): HeadingLine {
  return typeof input === 'string' ? { text: input } : input;
}

function renderLine(line: HeadingLine, accentClassName: string): ReactNode {
  const { text, accent } = line;
  if (!accent || !text.includes(accent)) return text;

  const [before, after] = text.split(accent);
  return (
    <>
      {before}
      <span className={accentClassName}>{accent}</span>
      {after}
    </>
  );
}

/**
 * Título com reveal por máscara: cada linha sobe de dentro de um recorte,
 * com stagger. O trecho `accent` recebe uma cor própria sem quebrar o
 * alinhamento das demais linhas.
 */
export function AnimatedHeading({
  lines,
  as: Tag = 'h2',
  className,
  lineClassName = 'block',
  accentClassName = 'bg-[linear-gradient(100deg,#27c8f5,#398bff_45%,#8b4dff)] bg-clip-text text-transparent',
  start = 'top 86%',
  delay = 0,
  stagger = 0.1,
}: Props): ReactNode {
  const ref = useGsapScope<HTMLHeadingElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-line]'), {
      scrollTrigger: { trigger: scope, start, once: true },
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
      {lines.map((raw) => {
        const line = toLine(raw);
        return (
          <span key={line.text} className="block overflow-hidden pb-[0.06em]">
            <span data-line className={lineClassName}>
              {renderLine(line, accentClassName)}
            </span>
          </span>
        );
      })}
    </Tag>
  );
}
