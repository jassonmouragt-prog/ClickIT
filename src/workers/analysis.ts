import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import sharp from 'sharp';
import { ExifTool } from 'exiftool-vendored';
import { Embedder } from '../ai/embedding.ts';
import { exposure, regionalSharpness, sharpness } from '../ai/quality.ts';
import { generatePreview } from '../services/preview.ts';
import { LIMITS } from '../lib/config.ts';
import type { Metadata, Photo } from '../types/domain.ts';
export interface Prepared { width: number; height: number; captureDate: string | null; thumbnailPath: string; previewPath: string; metadata: Metadata; embedding: number[] | null; hash: string; global: number; regional: number; light: number }
const config = workerData as { cache: string; model: string | null };
const exif = new ExifTool({ maxProcs: 1 });
sharp.cache({ memory: 32, files: 0, items: 20 }); sharp.concurrency(1);
const embedder = new Embedder();
const ready = config.model ? embedder.load(config.model) : Promise.resolve();
async function hashFile(file: string): Promise<string> { const h = createHash('sha256'); for await (const part of createReadStream(file)) h.update(part as Buffer); return h.digest('hex'); }
async function processPhoto(photo: Photo): Promise<Prepared> {
  await ready;
  const { previewPath, thumbnailPath, width, height } = await generatePreview(photo, config.cache, exif);
  const tags = await exif.read(photo.originalPath).catch(() => null);
  const { data, info } = await sharp(previewPath).resize(LIMITS.analysis, LIMITS.analysis, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const date = tags?.DateTimeOriginal;
  const captureDate = date && typeof date === 'object' && 'toDate' in date ? date.toDate()?.toISOString() ?? null : null;
  const metadata: Metadata = {};
  if (tags?.Model) metadata.camera = String(tags.Model);
  if (tags?.LensModel) metadata.lens = String(tags.LensModel);
  if (tags?.ISO) metadata.iso = Number(tags.ISO);
  if (tags?.FNumber) metadata.aperture = Number(tags.FNumber);
  if (tags?.ExposureTime) metadata.shutterSpeed = String(tags.ExposureTime);
  if (tags?.FocalLength) metadata.focalLength = String(tags.FocalLength);
  return { width, height, captureDate, thumbnailPath, previewPath, metadata, embedding: config.model ? await embedder.run(previewPath) : null, hash: await hashFile(photo.originalPath), global: sharpness(data, info.width, info.height), regional: regionalSharpness(data, info.width, info.height), light: exposure(data) };
}
parentPort?.on('message', (photo: Photo | 'CLOSE') => {
  if (photo === 'CLOSE') { void exif.end().finally(() => parentPort?.close()); return; }
  void processPhoto(photo).then(result => parentPort?.postMessage({ id: photo.id, result })).catch(e => parentPort?.postMessage({ id: photo.id, error: e instanceof Error ? e.message : 'Falha na análise' }));
});
