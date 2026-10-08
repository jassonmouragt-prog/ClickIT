'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useGsapScope, gsap } from '@/lib/anim';
import { Logo } from '@/components/Logo';
import { GradientButton } from '@/components/ui/Actions';
import { NAV_LINKS } from '@/lib/site';

export function Navbar(): ReactNode {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const ref = useGsapScope<HTMLElement>((scope) => {
    gsap.from(scope, { y: -18, opacity: 0, duration: 0.9, ease: 'power3.out' });
  });

  return (
    <header
      ref={ref}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        scrolled || open ? 'glass border-b border-hairline' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-5 md:h-[72px] md:px-8">
        <a href="/#topo" className="shrink-0" aria-label="ClickIT — início">
          <Logo />
        </a>

        <ul className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-lg px-3 py-2 text-[14px] text-mist transition-colors duration-300 hover:bg-white/[0.04] hover:text-cloud"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2.5">
          <GradientButton href="/#trial" variant="ghost" className="hidden !px-5 !py-2.5 !text-[14px] sm:inline-flex">
            Testar grátis
          </GradientButton>
          <GradientButton href="/checkout" className="!px-5 !py-2.5 !text-[14px]">
            Comprar ClickIT
          </GradientButton>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Abrir menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-hairline bg-white/[0.03] text-mist lg:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute inset-x-0 top-0 h-px bg-current transition-transform ${open ? 'translate-y-[6px] rotate-45' : ''}`} />
              <span className={`absolute inset-x-0 top-[6px] h-px bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute inset-x-0 top-[12px] h-px bg-current transition-transform ${open ? '-translate-y-[6px] -rotate-45' : ''}`} />
            </span>
          </button>
        </div>
      </nav>

      <div className={`overflow-hidden transition-[max-height,opacity] duration-400 lg:hidden ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <ul className="mx-auto flex max-w-[1240px] flex-col gap-1 px-5 pb-5">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-[15px] text-mist transition-colors hover:bg-white/[0.04] hover:text-cloud"
              >
                {link.label}
              </a>
            </li>
          ))}
          <li className="mt-2 flex flex-col gap-2">
            <GradientButton href="/#trial" variant="ghost" onClick={() => setOpen(false)} className="w-full">
              Testar grátis por 20 minutos
            </GradientButton>
            <GradientButton href="/checkout" onClick={() => setOpen(false)} className="w-full">
              Comprar ClickIT
            </GradientButton>
          </li>
        </ul>
      </div>
    </header>
  );
}
