import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { EditingStore } from './store.ts';
import type { ReferenceImage, ReferenceImageInput } from './types.ts';
export interface ReferenceView extends ReferenceImage { available: boolean; thumbnailUrl: string }
export async function referenceView(reference: ReferenceImage): Promise<ReferenceView> {
  const available = await access(reference.externalPath).then(() => true, () => false);
  return { ...reference, available, thumbnailUrl: `clickit://reference/${reference.id}?v=${reference.fingerprint}` };
}
export async function importReferences(store: EditingStore, profileId: string, mode: 'REFERENCE' | 'PAIR', files: string[]): Promise<ReferenceImage[]> {
  store.getEditingProfile(profileId);
  if ((mode === 'PAIR' && files.length !== 2) || (mode === 'REFERENCE' && files.length !== 1)) throw new Error('Selecione uma referência ou um par Antes/Depois.');
  const pairId = mode === 'PAIR' ? randomUUID() : null;
  const inputs: ReferenceImageInput[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    // Decode metadata only: rejects non-images. Never writes the selected file.
    await sharp(file, { limitInputPixels: 100_000_000 }).metadata();
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes);
    inputs.push({ profileId, photoId: null, externalPath: file, kind: mode === 'REFERENCE' ? 'REFERENCE' as const : i === 0 ? 'BEFORE' as const : 'AFTER' as const, pairId, fingerprint: hash.digest('hex') });
  }
  const result: ReferenceImage[] = [];
  store.transaction(() => { for (const input of inputs) result.push(store.addReferenceImage(input)); });
  return result;
}
export async function referenceThumbnail(reference: ReferenceImage): Promise<Buffer> {
  return sharp(reference.externalPath, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 360, height: 240, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}
