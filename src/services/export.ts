import { constants } from 'node:fs';
import { copyFile, mkdir, open, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExportResult, Photo } from '../types/domain.ts';
export function selected(photos: Photo[]): Photo[] { return photos.filter(p => p.decision === 'SELECTED' || p.decision === 'AI_SELECTED'); }
export async function exportPhotos(photos: Photo[], destination: string, mode: 'COPY' | 'LIST', cancelled: () => boolean, progress: (done: number, total: number) => void): Promise<ExportResult> {
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, '.clickit-export.json'), '{"clickitExport":1}', { flag: 'wx' }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
  const result: ExportResult = { copied: 0, total: photos.length, cancelled: false, destination, errors: [] };
  const manifest: { file: string; rating: number; favorite: boolean }[] = [];
  const batch = randomUUID();
  for (const photo of photos) {
    if (cancelled()) { result.cancelled = true; break; }
    let temporary: string | undefined;
    try {
      if (mode === 'COPY') {
        const before = await stat(photo.originalPath);
        if (before.size !== photo.fileSize || before.mtimeMs !== photo.mtime) throw new Error('Original alterado desde a indexação; reindexe antes de exportar.');
        // Unique suffix avoids collisions across subfolders and repeated exports. EXCL still prevents overwriting.
        const target = path.join(destination, `${path.parse(photo.fileName).name}_${photo.id.slice(0, 8)}_${batch.slice(0, 8)}${photo.extension}`);
        temporary = path.join(destination, `.clickit-${randomUUID()}.partial`);
        await copyFile(photo.originalPath, temporary, constants.COPYFILE_EXCL);
        const after = await stat(photo.originalPath);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Original mudou durante a cópia.');
        if (cancelled()) { result.cancelled = true; break; }
        // Reserve destination exclusively; only this task's reservation may be replaced.
        const reservation = await open(target, 'wx'); await reservation.close();
        try { await rename(temporary, target); temporary = undefined; } catch (e) { await unlink(target).catch(() => {}); throw e; }
      }
      manifest.push({ file: photo.originalPath, rating: photo.rating, favorite: photo.favorite });
      result.copied++;
    } catch (e) { result.errors.push(`${photo.fileName}: ${e instanceof Error ? e.message : 'Falha de exportação'}`); }
    finally { if (temporary) await unlink(temporary).catch(() => {}); }
    progress(result.copied + result.errors.length, photos.length);
  }
  if (mode === 'LIST' && !result.cancelled) {
    const handle = await open(path.join(destination, `ClickIT-selecao-${batch}.json`), 'wx');
    try { await handle.writeFile(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), photos: manifest }, null, 2)); } finally { await handle.close(); }
  }
  return result;
}
