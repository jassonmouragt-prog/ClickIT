import type { ReactNode } from 'react';

export function LogoMark({ className = 'h-7 w-7', title }: { className?: string; title?: string }): ReactNode {
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id="clickit-mark" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#27C8F5" />
          <stop offset="0.45" stopColor="#398BFF" />
          <stop offset="1" stopColor="#8B4DFF" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#clickit-mark)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19V12a7 7 0 0 1 7-7h7" />
        <path d="M29 5h7a7 7 0 0 1 7 7v7" />
        <path d="M43 29v7a7 7 0 0 1-7 7h-7" />
        <path d="M19 43h-7a7 7 0 0 1-7-7v-7" />
      </g>
    </svg>
  );
}

export function Logo({ className = '', markClassName = 'h-7 w-7', size = 'text-[19px]' }: { className?: string; markClassName?: string; size?: string }): ReactNode {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} title="ClickIT" />
      <span className={`${size} font-semibold tracking-[-0.03em] text-cloud`}>
        Click<span className="text-signature">IT</span>
      </span>
    </span>
  );
}
