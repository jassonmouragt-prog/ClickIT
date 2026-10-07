import { LIMITS, thresholds } from '../lib/config.ts';
import type { Analysis } from '../types/domain.ts';
export interface Candidate { id: string; date: string | null; embedding: number[] | null; hash: string; analysis: Analysis }
export interface RankedGroup { ids: string[]; similarities: number[]; duplicate: boolean }
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; aa += a[i]! ** 2; bb += b[i]! ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function rank(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => b.analysis.overall - a.analysis.overall || a.id.localeCompare(b.id));
}
// Temporal proximity lowers the visual threshold; time alone never creates an edge.
export function pairThreshold(a: { date: string | null }, b: { date: string | null }): number {
  const delta = a.date && b.date ? Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 1000 : Infinity;
  return delta <= LIMITS.temporalSeconds ? LIMITS.similarity : LIMITS.visualOnlySimilarity;
}
export interface VisualCandidate { id: string; date: string | null; embedding: number[] | null; hash: string }
export function connection(a: VisualCandidate, b: VisualCandidate) {
  const similarity = a.embedding && b.embedding ? cosine(a.embedding, b.embedding) : null;
  const threshold = pairThreshold(a, b);
  const exactDuplicate = !!a.hash && a.hash === b.hash;
  return { similarity, threshold, exactDuplicate, connected: exactDuplicate || (similarity !== null && Number.isFinite(similarity) && similarity >= threshold) };
}
// All pairs, independent of input order, UUID order, scores and facial expression.
// Union-find retains O(n) state; no quadratic adjacency matrix in production.
export function connectedComponents<T extends VisualCandidate>(candidates: T[]): T[][] {
  const parents = candidates.map((_, i) => i);
  const sizes = candidates.map(() => 1);
  const find = (index: number): number => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]!]!; index = parents[index]!; }
    return index;
  };
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    if (!connection(candidates[i]!, candidates[j]!).connected) continue;
    let a = find(i), b = find(j);
    if (a === b) continue;
    if (sizes[a]! < sizes[b]!) [a, b] = [b, a];
    parents[b] = a; sizes[a]! += sizes[b]!;
  }
  const components = new Map<number, T[]>();
  candidates.forEach((candidate, i) => {
    const root = find(i), members = components.get(root) ?? [];
    members.push(candidate); components.set(root, members);
  });
  return [...components.values()];
}
export function group(candidates: Candidate[]): RankedGroup[] {
  const sorted = [...candidates].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));
  return connectedComponents(sorted).map(members => {
    const representative = members[0]!;
    const g = { members, similarities: members.map(c => c.id === representative.id || (!!c.hash && c.hash === representative.hash) ? 1 : c.embedding && representative.embedding ? cosine(c.embedding, representative.embedding) : 0) };
    const ranked = rank(g.members);
    const maxFocus = Math.max(...ranked.map(c => c.analysis.faceScore ?? c.analysis.regionalSharpness));
    for (const c of ranked) {
      const focus = c.analysis.faceScore ?? c.analysis.regionalSharpness;
      if (c.analysis.blur === 'UNCERTAIN' && maxFocus > thresholds.clearRegion && focus < maxFocus * thresholds.relativeFocusRatio) {
        c.analysis.blur = 'POSSIBLE_BLUR'; c.analysis.confidence = 0.75;
        c.analysis.insight = 'Possível problema de foco: outras fotos deste grupo têm regiões mais nítidas. Revise antes de decidir.';
      }
    }
    return { ids: ranked.map(c => c.id), similarities: ranked.map(c => g.similarities[g.members.indexOf(c)]!), duplicate: ranked.length > 1 && ranked.every(c => c.hash === ranked[0]!.hash) };
  });
}
