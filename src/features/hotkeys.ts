import { useEffect } from 'react';
export const HOTKEYS = { ArrowLeft: 'previous', ArrowRight: 'next', a: 'select', r: 'review', x: 'reject', f: 'favorite', ' ': 'viewer', g: 'grid', c: 'compare', Escape: 'close', '0': 'rating0', '1': 'rating1', '2': 'rating2', '3': 'rating3', '4': 'rating4', '5': 'rating5' } as const;
export type Action = typeof HOTKEYS[keyof typeof HOTKEYS];
export function useHotkeys(action: (key: Action) => void, enabled = true): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!enabled || event.ctrlKey || event.altKey || event.metaKey || target?.closest('input,textarea,select,[contenteditable=true],[role=dialog]')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key in HOTKEYS) { event.preventDefault(); action(HOTKEYS[key as keyof typeof HOTKEYS]); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [action, enabled]);
}
