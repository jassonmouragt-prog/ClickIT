import { createReadStream } from 'node:fs';
import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const scope = 'Synthetic robustness/performance only; no human aesthetic preference or professional selection validation.';
export const scales = [100, 500, 1000, 3000, 5000];
export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function filesIn(dir) {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
export async function directoryBytes(dir) {
  let bytes = 0;
  for (const file of await filesIn(dir)) bytes += (await stat(file)).size;
  return bytes;
}
export async function json(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
}
export async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
export function args(argv, allowed) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!allowed.includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || key in result) throw new Error(`Argumento inválido: ${key}`);
    result[key] = argv[i + 1];
  }
  return result;
}
export function contained(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}
export async function productionFingerprint() {
  const files = [...await filesIn(path.join(root, 'src')), ...await filesIn(path.join(root, 'resources/models'))];
  const result = {};
  for (const file of files) result[path.relative(root, file).replaceAll('\\', '/')] = await sha256(file);
  return result;
}
export async function harnessFingerprint() {
  const names = ['scale-face-client.mjs', 'scale-face-host.mjs', 'scale-face-renderer.ts', 'scale-harness-state.mjs', 'scale-run.mjs', 'benchmark-scale.mjs', 'benchmark-face-smoke.mjs', 'benchmark-harness.mjs'];
  const result = {};
  for (const name of names) result[name] = await sha256(path.join(root, 'scripts', name));
  return result;
}
export function groupingMetrics(entries, photos) {
  const truth = new Map(entries.map(e => [e.file, e.trueGroup]));
  const predicted = new Map(), fragments = new Map();
  for (const photo of photos) {
    const label = truth.get(photo.fileName);
    if (!label) throw new Error(`Foto sem ground truth: ${photo.fileName}`);
    const group = photo.groupId ?? `missing:${photo.id}`;
    if (!predicted.has(group)) predicted.set(group, new Map());
    const counts = predicted.get(group);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (!fragments.has(label)) fragments.set(label, new Set());
    fragments.get(label).add(group);
  }
  let majority = 0, mergedPairs = 0, trueTogether = 0;
  for (const counts of predicted.values()) {
    const sizes = [...counts.values()], total = sizes.reduce((a, b) => a + b, 0);
    majority += Math.max(...sizes);
    const same = sizes.reduce((n, s) => n + s * (s - 1) / 2, 0);
    trueTogether += same;
    mergedPairs += total * (total - 1) / 2 - same;
  }
  const trueSizes = new Map();
  for (const e of entries) trueSizes.set(e.trueGroup, (trueSizes.get(e.trueGroup) ?? 0) + 1);
  const truePairs = [...trueSizes.values()].reduce((n, s) => n + s * (s - 1) / 2, 0);
  return {
    coverage: photos.filter(p => p.groupId).length / entries.length,
    purity: photos.length ? majority / photos.length : null,
    fragmentation: fragments.size ? [...fragments.values()].reduce((n, s) => n + s.size, 0) / fragments.size : null,
    falseMerges: [...predicted.values()].filter(m => m.size > 1).length,
    falseSplits: [...fragments.values()].filter(s => s.size > 1).length,
    falseMergePairs: mergedPairs, falseSplitPairs: truePairs - trueTogether,
    trueGroups: trueSizes.size, predictedGroups: predicted.size,
    definitions: { purity: 'sum largest true class per predicted group / photos', fragmentation: 'mean number of predicted fragments per true source group; ideal 1', falseMerges: 'predicted groups containing >1 true source', falseSplits: 'true sources spread across >1 predicted group', labels: 'source identity, not human sequence truth; similar source photos can legitimately merge' }
  };
}
