import type { Photo } from '../types/domain.ts';
export type Filter = 'ALL' | 'PICKS' | 'SELECTED' | 'FAVORITES' | 'REVIEW' | 'REJECTED' | 'BLUR' | 'EYES' | 'SIMILAR' | 'DUPLICATE' | 'NO_FACE' | 'FACE';
export const FILTERS: [Filter, string][] = [['ALL', 'Todas'], ['PICKS', 'ClickIT Picks'], ['SELECTED', 'Selecionadas'], ['FAVORITES', 'Favoritas'], ['REVIEW', 'Revisar'], ['REJECTED', 'Rejeitadas'], ['SIMILAR', 'Semelhantes'], ['BLUR', 'Possível desfoque'], ['EYES', 'Olhos fechados'], ['DUPLICATE', 'Duplicadas'], ['FACE', 'Com rosto'], ['NO_FACE', 'Sem rosto']];
export function isSelected(p: Photo): boolean { return p.decision === 'SELECTED' || p.decision === 'AI_SELECTED'; }
export function asset(p: Photo, kind: 'thumbnail' | 'preview' | 'original'): string { return `clickit://photo/${p.id}/${kind}?v=${p.mtime}`; }
export function filterPhotos(photos: Photo[], filter: Filter, search: string): Photo[] {
  const groupCounts = new Map<string, number>(); for (const p of photos) if (p.groupId) groupCounts.set(p.groupId, (groupCounts.get(p.groupId) ?? 0) + 1);
  return photos.filter(p => {
    if (!p.fileName.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false;
    switch (filter) {
      case 'ALL': return true;
      case 'SELECTED': return isSelected(p);
      case 'PICKS': return p.rank === 1;
      case 'FAVORITES': return p.favorite;
      case 'REVIEW': return p.decision === 'REVIEW';
      case 'REJECTED': return p.decision === 'REJECTED';
      case 'BLUR': return !p.keep && (p.analysis?.blur === 'UNCERTAIN' || p.analysis?.blur === 'POSSIBLE_BLUR');
      case 'EYES': return !p.keep && p.analysis?.faces.some(f => f.eyes === 'CLOSED');
      case 'SIMILAR': return !!p.groupId && (groupCounts.get(p.groupId) ?? 0) > 1;
      case 'DUPLICATE': return p.duplicate;
      case 'FACE': return !!p.analysis?.faces.length;
      case 'NO_FACE': return p.analysis?.facesAvailable && !p.analysis.faces.length;
    }
  });
}
