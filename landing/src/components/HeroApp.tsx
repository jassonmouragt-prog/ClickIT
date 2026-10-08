'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { HERO_GRID } from '@/lib/photos';
import { useGsapScope, gsap, parallax } from '@/lib/anim';
import { LogoMark } from '@/components/Logo';

const NAV = [
  { label: 'Todas', count: '2.847', active: true },
  { label: 'ClickIT Picks', count: '148' },
  { label: 'Selecionadas', count: '320' },
  { label: 'Favoritas', count: '186' },
  { label: 'Revisar', count: '64' },
  { label: 'Rejeitadas', count: '412' },
];

const CHIPS = [
  { label: 'Todas', count: '2.847', active: true },
  { label: 'ClickIT Picks', count: '148' },
  { label: 'Semelhantes', count: '96' },
  { label: 'Possível desfoque', count: '62' },
  { label: 'Olhos fechados', count: '49' },
];

const SCORES = [
  { label: 'Foco', value: 94 },
  { label: 'Exposição', value: 88 },
  { label: 'Rosto', value: 91 },
  { label: 'Olhos', value: 96 },
];

function Flag({ kind }: { kind: string }): ReactNode {
  if (kind === 'pick') {
    return (
      <span className="mock-flag absolute bottom-1.5 left-1.5 rounded-[5px] border border-azure/40 bg-[#0d1524]/95 px-1.5 py-[3px] text-[8.5px] font-semibold text-[#a9ccff] backdrop-blur-sm">
        ClickIT Pick
      </span>
    );
  }
  if (kind === 'eyes') {
    return (
      <span className="mock-flag absolute bottom-1.5 left-1.5 rounded-[5px] border border-[#d6aa65]/40 bg-[#1b160d]/95 px-1.5 py-[3px] text-[8.5px] font-medium text-[#e2c08c] backdrop-blur-sm">
        Olhos fechados
      </span>
    );
  }
  if (kind === 'blur') {
    return (
      <span className="mock-flag absolute bottom-1.5 left-1.5 rounded-[5px] border border-[#d6aa65]/40 bg-[#1b160d]/95 px-1.5 py-[3px] text-[8.5px] font-medium text-[#e2c08c] backdrop-blur-sm">
        Possível desfoque
      </span>
    );
  }
  return null;
}

export function HeroApp(): ReactNode {
  const ref = useGsapScope<HTMLDivElement>((scope, { desktop }) => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from(scope.querySelector('.mock-shell'), { y: 26, scale: 0.965, opacity: 0, duration: 1 })
      .from(scope.querySelectorAll('.mock-side'), { x: -12, opacity: 0, duration: 0.5, stagger: 0.055 }, '-=0.55')
      .from(scope.querySelectorAll('.mock-chip'), { y: 8, opacity: 0, duration: 0.4, stagger: 0.05 }, '-=0.35')
      .from(scope.querySelectorAll('.mock-cell'), { y: 20, scale: 0.95, opacity: 0, duration: 0.55, stagger: 0.045 }, '-=0.2')
      .from(scope.querySelector('.mock-scan'), { opacity: 0, duration: 0.25 }, '-=0.15')
      .fromTo(
        scope.querySelector('.mock-scan'),
        { yPercent: -10 },
        { yPercent: 760, duration: 1.1, ease: 'power2.inOut' },
        '<',
      )
      .to(scope.querySelector('.mock-scan'), { opacity: 0, duration: 0.3 })
      .from(scope.querySelectorAll('.mock-flag'), { scale: 0.55, opacity: 0, duration: 0.42, stagger: 0.1, ease: 'back.out(1.7)' }, '-=0.75')
      .from(scope.querySelector('.mock-pick'), { opacity: 0, scale: 0.9, duration: 0.5, ease: 'power2.out' }, '-=0.4')
      .fromTo(
        scope.querySelector('.mock-progress-fill'),
        { scaleX: 0.34 },
        { scaleX: 1, duration: 1.1, ease: 'power2.inOut' },
        '-=0.9',
      )
      .from(scope.querySelectorAll('.mock-meter'), { scaleX: 0, transformOrigin: 'left center', duration: 0.7, stagger: 0.08, ease: 'power2.out' }, '-=0.8')
      .from(scope.querySelector('.mock-score'), { opacity: 0, y: 10, duration: 0.5 }, '-=0.5');

    if (desktop) {
      parallax(scope, scope.querySelector('.mock-shell'), 4);
      gsap.to(scope.querySelector('.mock-pick'), {
        boxShadow: '0 0 0 1px rgba(57,139,255,0.55), 0 18px 40px -28px rgba(57,139,255,0.9)',
        repeat: -1,
        yoyo: true,
        duration: 2.4,
        ease: 'sine.inOut',
        delay: 3,
      });
    }
  });

  return (
    <div ref={ref} className="relative" aria-hidden="true">
      <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[36px] bg-[radial-gradient(closest-side,rgba(57,139,255,0.16),transparent_78%)] blur-2xl" />

      <div className="mock-shell relative overflow-hidden rounded-2xl border border-hairline bg-ink-900/95 shadow-panel">
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <LogoMark className="h-4 w-4" />
          <span className="text-[12px] font-medium text-cloud">Casamento Ana &amp; Pedro</span>
          <span className="hidden text-[11px] text-fog sm:inline">· projeto local</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/[0.03] px-2.5 py-1 text-[10px] text-mist">
            <span className="h-1.5 w-1.5 rounded-full bg-[#57c98f]" />
            processamento local
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[168px_minmax(0,1fr)] xl:grid-cols-[168px_minmax(0,1fr)_236px]">
          <aside className="hidden flex-col gap-1 border-r border-hairline bg-[#0b0f18] p-3 lg:flex">
            <p className="eyebrow mb-2 px-1.5">biblioteca</p>
            {NAV.map((item) => (
              <div
                key={item.label}
                className={`mock-side flex items-center justify-between rounded-lg px-2.5 py-2 text-[12px] ${
                  item.active
                    ? 'border border-azure/25 bg-gradient-to-r from-azure/15 to-violet/15 text-cloud'
                    : 'text-mist'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <small className="pl-2 text-[10px] text-fog">{item.count}</small>
              </div>
            ))}
            <p className="eyebrow mt-4 px-1.5">projetos</p>
            <div className="mock-side rounded-lg px-2.5 py-2 text-[12px] text-mist">Casamento Ana &amp; Pedro</div>
            <div className="mock-side rounded-lg px-2.5 py-2 text-[12px] text-mist">Retratos · estúdio</div>
          </aside>

          <div className="relative min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {CHIPS.map((chip) => (
                <span
                  key={chip.label}
                  className={`mock-chip inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] whitespace-nowrap ${
                    chip.active ? 'border-azure/40 bg-azure/12 text-[#cfe2ff]' : 'border-hairline bg-white/[0.02] text-fog'
                  }`}
                >
                  {chip.label}
                  <b className="font-medium text-fog">{chip.count}</b>
                </span>
              ))}
            </div>

            <div className="relative grid grid-cols-3 gap-2 sm:grid-cols-4">
              <div className="mock-scan pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-[linear-gradient(180deg,transparent,rgba(57,139,255,0.16),transparent)]" />
              {HERO_GRID.map((shot, index) => {
                const flag = shot.flags?.find((f) => f.kind !== 'stars' && f.kind !== 'heart');
                const stars = shot.flags?.find((f) => f.kind === 'stars');
                const heart = shot.flags?.find((f) => f.kind === 'heart');
                const isPick = Boolean(flag?.kind === 'pick');
                return (
                  <div
                    key={shot.name}
                    className={`mock-cell group relative aspect-[4/3] overflow-hidden rounded-lg border bg-panel ${
                      isPick ? 'mock-pick border-azure/50' : 'border-white/[0.05]'
                    }`}
                  >
                    <Image
                      src={shot.src}
                      alt=""
                      fill
                      sizes="(min-width: 1280px) 18vw, (min-width: 640px) 22vw, 30vw"
                      loading={index < 4 ? 'eager' : 'lazy'}
                      priority={index < 4}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="absolute top-1.5 left-1.5 h-3 w-3 rounded-[3px] border border-white/30 bg-black/30" />
                    {heart ? <span className="absolute top-1.5 right-1.5 text-[10px] text-[#ff8fa3]">♥</span> : null}
                    {stars ? (
                      <span className="absolute right-1.5 bottom-1.5 text-[8.5px] tracking-tight text-[#c9b8ff]">
                        {'★★★★★'.slice(0, stars.value)}
                        <span className="text-white/25">{'★★★★★'.slice(stars.value)}</span>
                      </span>
                    ) : null}
                    {flag ? <Flag kind={flag.kind} /> : null}
                    <span className="absolute bottom-1.5 left-1.5 hidden text-[8.5px] text-white/70" />
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-lg border border-hairline bg-white/[0.02] px-3 py-2.5">
              <span className="text-[10.5px] whitespace-nowrap text-mist">análise concluída</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                <div className="mock-progress-fill h-full w-full origin-left rounded-full bg-[var(--signature)]" />
              </div>
              <span className="text-[10.5px] tabular-nums text-fog">2.847 / 2.847</span>
            </div>
          </div>

          <aside className="hidden border-l border-hairline bg-[#0b0f18] p-4 xl:block">
            <p className="text-[11px] font-medium text-cloud">DSC_4824.ARW</p>
            <p className="mt-0.5 text-[10px] text-fog">1 de 2.847 · sequência 12</p>

            <div className="mock-score mt-4 flex items-baseline justify-between">
              <span className="eyebrow">score clickit</span>
              <strong className="text-[30px] leading-none font-medium tracking-[-0.04em] text-[#af9bff]">92</strong>
            </div>

            <div className="mt-4 space-y-3">
              {SCORES.map((row) => (
                <div key={row.label} className="flex items-center gap-2.5 text-[11px]">
                  <span className="w-16 shrink-0 text-fog">{row.label}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div className="mock-meter h-full w-full rounded-full bg-[var(--signature)]" style={{ width: `${row.value}%` }} />
                  </div>
                  <span className="w-5 text-right tabular-nums text-mist">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-hairline bg-panel p-3">
              <p className="text-[10px] font-semibold text-[#a99aff]">Insight ClickIT</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-mist">
                Enquadramento estável e foco consistente. Candidata forte para a seleção final.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <span className="rounded-md bg-[var(--signature)] px-2 py-2 text-center text-[11px] font-medium text-white">Selecionar</span>
              <span className="rounded-md border border-hairline bg-white/[0.03] px-2 py-2 text-center text-[11px] text-mist">Favoritar</span>
              <span className="rounded-md border border-hairline bg-white/[0.03] px-2 py-2 text-center text-[11px] text-mist">Revisar</span>
              <span className="rounded-md border border-hairline bg-white/[0.03] px-2 py-2 text-center text-[11px] text-mist">Rejeitar</span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
