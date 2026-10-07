import { parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import { ExifTool } from 'exiftool-vendored';
import { generatePreview } from '../services/preview.ts';
import type { Photo } from '../types/domain.ts';
const exif = new ExifTool({ maxProcs: 1 });
sharp.cache({ memory: 32, files: 0, items: 20 }); sharp.concurrency(1);
parentPort?.on('message', (photo: Photo | 'CLOSE') => {
  if (photo === 'CLOSE') { void exif.end().finally(() => parentPort?.close()); return; }
  void generatePreview(photo, (workerData as { cache: string }).cache, exif)
    .then(result => parentPort?.postMessage({ result }))
    .catch(error => parentPort?.postMessage({ error: error instanceof Error ? error.stack ?? error.message : String(error) }));
});
