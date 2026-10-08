import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'Imagens Teste');
const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png'));
const size = 320;
const cols = 4;
const tiles = [];
for (let i = 0; i < files.length; i += 1) {
  const overlay = Buffer.from(
    `<svg width="${size}" height="${size}"><text x="8" y="24" font-size="16" fill="white" font-family="sans-serif">${i + 1}</text></svg>`,
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
  .toFile(join(here, '..', '..', '.tmp-nima-docker', 'contact2.jpg'));
console.log('ok');
