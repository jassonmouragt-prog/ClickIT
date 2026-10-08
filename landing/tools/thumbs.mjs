import { mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'public', 'photos');
await mkdir(outDir, { recursive: true });

const sets = [
  { id: 'seq', dir: join(root, '..', 'Validation Datasets', 'couple-event-01'), files: ['01.png', '02.png', '03.png', '04.png', '05.png', '06.png', '07.png'] },
  { id: 'por', dir: join(root, '..', 'Validation Datasets', 'portrait-expression-01'), files: null },
  { id: 'cmp', dir: join(root, '..', 'Validation Datasets', 'composition-01'), files: null },
];

for (const set of sets) {
  const files = set.files ?? (await readdir(set.dir)).filter((f) => f.endsWith('.png')).sort();
  let index = 1;
  for (const file of files) {
    const input = join(set.dir, file);
    const name = `${set.id}-${String(index).padStart(2, '0')}.webp`;
    await sharp(input).resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 74 }).toFile(join(outDir, name));
    console.log(name);
    index += 1;
  }
}

const meta = await readdir(outDir);
console.log(`done: ${meta.length} files`);
