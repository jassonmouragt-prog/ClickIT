import path from 'node:path';
import { mkdir, rename, unlink } from 'node:fs/promises';
import sharp from 'sharp';
import type { ExifTool } from 'exiftool-vendored';
import { cacheKey, RAW } from '../lib/files.ts';
import { LIMITS } from '../lib/config.ts';
import type { Photo } from '../types/domain.ts';

export type Preview = Pick<Photo, 'width' | 'height'> & { previewPath: string; thumbnailPath: string };
export function previewPaths(photo: Photo, cache: string): { previewPath: string; thumbnailPath: string } {
  const key = cacheKey(photo.originalPath, photo.fileSize, photo.mtime);
  return { previewPath: path.join(cache, key + '-preview.jpg'), thumbnailPath: path.join(cache, key + '-thumb.jpg') };
}
// Shared by import and analysis: same decoder, orientation, sizes and cache keys.
export async function generatePreview(photo: Photo, cache: string, exif: ExifTool): Promise<Preview> {
  await mkdir(cache, { recursive: true });
  const paths = previewPaths(photo, cache);
  let source = photo.originalPath;
  const temporary = RAW.has(photo.extension) ? paths.previewPath + '-embedded.jpg' : null;
  try {
    if (temporary) {
      await unlink(temporary).catch(() => {});
      let extracted = false;
      for (const tag of ['JpgFromRaw', 'PreviewImage', 'OtherImage'] as const) {
        try { await exif.extractBinaryTag(tag, photo.originalPath, temporary); extracted = true; break; }
        catch { await unlink(temporary).catch(() => {}); }
      }
      if (!extracted) throw new Error('RAW sem preview JPEG compatível. Original preservado.');
      source = temporary;
    }
    const original = await sharp(source, { limitInputPixels: 150_000_000 }).metadata();
    await sharp(source, { limitInputPixels: 150_000_000 }).rotate().resize(LIMITS.preview, LIMITS.preview, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(paths.previewPath + '.partial');
    await rename(paths.previewPath + '.partial', paths.previewPath);
    await sharp(paths.previewPath).resize(LIMITS.thumbnail, LIMITS.thumbnail, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(paths.thumbnailPath + '.partial');
    await rename(paths.thumbnailPath + '.partial', paths.thumbnailPath);
    const rotated = [5, 6, 7, 8].includes(original.orientation ?? 1);
    return { ...paths, width: (rotated ? original.height : original.width) ?? 0, height: (rotated ? original.width : original.height) ?? 0 };
  } finally {
    for (const file of [temporary, paths.previewPath + '.partial', paths.thumbnailPath + '.partial']) {
      if (file) await unlink(file).catch(() => {});
    }
  }
}
