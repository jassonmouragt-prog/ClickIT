'use client';

import { useRef, type ReactNode } from 'react';
import { useGsapScope, gsap, prefersReducedMotion } from '@/lib/anim';

type Props = {
  children: ReactNode;
  href?: string;
  variant?: 'primary' | 'ghost';
  className?: string;
  onClick?: () => void;
};

/** CTA principal com hover magnético muito sutil. */
export function GradientButton({ children, href = '/checkout', variant = 'primary', className = '', onClick }: Props): ReactNode {
  const ref = useRef<HTMLAnchorElement>(null);

  const handleEnter = (): void => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    gsap.to(el, { x: 3, y: -3, duration: 0.4, ease: 'power3.out' });
  };

  const handleLeave = (): void => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    gsap.to(el, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, 0.5)' });
  };

  return (
    <a
      ref={ref}
      href={href}
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`${variant === 'primary' ? 'btn-primary' : 'btn-ghost'} ${className}`}
    >
      {children}
    </a>
  );
}

type SectionHeaderProps = {
  eyebrow?: string;
  title: string[];
  lead?: string;
  align?: 'left' | 'center';
  className?: string;
  badge?: ReactNode;
  children?: ReactNode;
};

export function SectionHeader({ eyebrow, title, lead, align = 'left', className = '', badge, children }: SectionHeaderProps): ReactNode {
  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope.querySelectorAll('[data-head-item]'), {
      scrollTrigger: { trigger: scope, start: 'top 84%', once: true },
      y: 24,
      opacity: 0,
      filter: 'blur(8px)',
      duration: 0.8,
      stagger: 0.09,
      ease: 'power3.out',
      clearProps: 'filter',
    });
  });

  const centered = align === 'center';

  return (
    <header ref={ref} className={`${centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'} ${className}`}>
      {eyebrow ? <p data-head-item className="eyebrow mb-5">{eyebrow}</p> : null}
      <h2 data-head-item className="text-[clamp(28px,4vw,50px)] font-semibold leading-[1.06] tracking-[-0.03em] text-cloud">
        {title.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h2>
      {lead ? (
        <p data-head-item className="mt-6 text-[16px] leading-relaxed text-mist md:text-[17px]">
          {lead}
        </p>
      ) : null}
      {badge ? <div data-head-item className="mt-6">{badge}</div> : null}
      {children}
    </header>
  );
}
