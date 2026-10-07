import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const RASTER = new Set(['.jpg', '.jpeg', '.png']);
export const RAW = new Set(['.cr2', '.cr3', '.nef', '.arw', '.raf', '.dng']);
export function supported(file: string): boolean { const e = path.extname(file).toLowerCase(); return RASTER.has(e) || RAW.has(e); }
export function cacheKey(file: string, size: number, mtime: number): string { return createHash('sha256').update(`${path.resolve(file)}\0${size}\0${mtime}`).digest('hex'); }
export async function* walk(root: string, cancelled: () => boolean, exclude?: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.some(entry => entry.name === '.clickit-export.json')) return;
  for (const entry of entries) {
    if (cancelled()) return;
    const file = path.join(root, entry.name);
    if (exclude && path.resolve(file) === path.resolve(exclude)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* walk(file, cancelled, exclude);
    else if (entry.isFile() && supported(file)) yield file;
  }
}
export async function exists(file: string | null): Promise<boolean> { if (!file) return false; try { return (await stat(file)).isFile(); } catch { return false; } }
export function inside(root: string, target: string): boolean { const relative = path.relative(path.resolve(root), path.resolve(target)); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); }
