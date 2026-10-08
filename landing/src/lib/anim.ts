'use client';

import { useEffect, useRef, useState, type DependencyList, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Executa uma timeline GSAP no cliente, com escopo no elemento retornado e
 * revert() automático no unmount. Nada anima quando o usuário pede menos movimento:
 * os elementos já nascem no estado final definido pelo CSS.
 */
export function useGsapScope<T extends HTMLElement = HTMLDivElement>(
  factory: (scope: T, self: { desktop: boolean }) => void,
  deps: DependencyList = [],
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const ctx = gsap.context(() => factory(el, { desktop }), el);
    return () => ctx.revert();
  }, deps);

  return ref;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

type RevealFrom = {
  y?: number;
  scale?: number;
  blur?: number;
  duration?: number;
  delay?: number;
  stagger?: number;
  start?: string;
};

/** Reveal padrão da página: sobe, desembaca e entra em foco. */
export function revealIn(scope: Element, targets: string, options: RevealFrom = {}): void {
  const {
    y = 28,
    scale = 1,
    blur = 10,
    duration = 0.9,
    delay = 0,
    stagger = 0.08,
    start = 'top 82%',
  } = options;

  gsap.from(targets, {
    scrollTrigger: { trigger: scope, start, once: true },
    y,
    scale,
    opacity: 0,
    filter: `blur(${blur}px)`,
    duration,
    delay,
    stagger,
    ease: 'power3.out',
    clearProps: 'filter',
  });
}

/** Parallax curto e suave; nunca o suficiente para causar enjoo. */
export function parallax(scope: Element, target: Element | null, amount: number, start = 'top bottom'): void {
  if (!target) return;
  gsap.fromTo(
    target,
    { yPercent: -amount },
    {
      yPercent: amount,
      ease: 'none',
      scrollTrigger: { trigger: scope, start, end: 'bottom top', scrub: 0.6 },
    },
  );
}
