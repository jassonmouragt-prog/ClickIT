import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'public', 'photos');
const files = (await readdir(dir)).sort();
const size = 240;
const cols = 6;
const tiles = [];
for (let i = 0; i < files.length; i += 1) {
  const label = files[i].replace('.webp', '');
  const overlay = Buffer.from(
    `<svg width="${size}" height="${size}"><text x="8" y="24" font-size="18" fill="white" font-family="sans-serif">${label}</text></svg>`,
  );
  tiles.push(
    await sharp(join(dir, files[i]))
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: overlay, gravity: 'northwest' }])
      .png()
      .toBuffer(),
  );
}
const rows = Math.ceil(tiles.length / cols);
const composite = tiles.map((input, i) => ({
  input,
  left: (i % cols) * size,
  top: Math.floor(i / cols) * size,
}));
await sharp({ create: { width: cols * size, height: rows * size, channels: 3, background: '#111111' } })
  .composite(composite)
  .jpeg({ quality: 82 })
  .toFile(join(here, '..', '..', '.tmp-nima-docker', 'contact.jpg'));
console.log('ok');
