import type { ReactNode } from 'react';

/** Enquadramento de interface: chrome mínimo, sem borda chamativa. */
export function ScreenshotFrame({
  children,
  label,
  className = '',
  tone = 'dark',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  tone?: 'dark' | 'raised';
}): ReactNode {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-hairline ${
        tone === 'raised' ? 'bg-panel-2' : 'bg-ink-900'
      } shadow-panel ${className}`}
    >
      {label ? (
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-azure/70" />
          <span className="text-[11px] font-medium tracking-[0.16em] text-fog uppercase">{label}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function FeatureBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'good' }): ReactNode {
  const tones: Record<string, string> = {
    neutral: 'border-hairline bg-white/[0.03] text-mist',
    accent: 'border-azure/30 bg-azure/10 text-[#9cc7ff]',
    warn: 'border-[#d6aa65]/30 bg-[#d6aa65]/10 text-[#e2c08c]',
    good: 'border-[#57c98f]/30 bg-[#57c98f]/10 text-[#8ee2b8]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Metric({ value, label, hint }: { value: string; label: string; hint?: string }): ReactNode {
  return (
    <div className="border-t border-hairline pt-5">
      <p className="text-[clamp(34px,5vw,54px)] leading-none font-semibold tracking-[-0.04em] text-cloud">{value}</p>
      <p className="mt-3 text-sm font-medium text-mist">{label}</p>
      {hint ? <p className="mt-1.5 text-[13px] leading-relaxed text-fog">{hint}</p> : null}
    </div>
  );
}
