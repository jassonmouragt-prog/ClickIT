import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INPUT = path.join(ROOT, 'build', 'symbol.png');
const OUT = path.join(ROOT, 'build', 'icon.ico');
const PREVIEW = path.join(ROOT, 'build', 'icon.png');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const CANVAS = 256;
const MARGIN = 0.07;
const CONTENT_FRAC = 1 - 2 * MARGIN;
const CHECK = process.argv.includes('--check');

function fail(msg) {
  console.error(`[generate-icon] ${msg}`);
  process.exit(1);
}

function ico(bufferEntries) {
  const count = bufferEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const entryBytes = [];
  const payloads = [];
  for (const { size, bytes } of bufferEntries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(bytes.length, 8);
    entry.writeUInt32LE(offset, 12);
    entryBytes.push(entry);
    payloads.push(bytes);
    offset += bytes.length;
  }
  return Buffer.concat([header, ...entryBytes, ...payloads]);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const summary = {};

async function analyze(src) {
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) {
    fail(`build/symbol.png precisa de canal alfa (fundo transparente). Recebido: ${meta.format} ${meta.width}x${meta.height} sem transparência.`);
  }
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let minX = W, minY = H, maxX = -1, maxY = -1, ink = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        ink++;
      }
    }
  }
  if (ink === 0) fail('build/symbol.png não possui pixels visíveis.');
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const aspect = cw / ch;
  summary.source = { format: meta.format, width: meta.width, height: meta.height, hasAlpha: true, content: { w: cw, h: ch, aspect: Number(aspect.toFixed(3)), inkRatio: Number((ink / (W * H)).toFixed(3)) } };
  if (aspect > 1.35 || aspect < 0.75) {
    console.warn(`[generate-icon] AVISO: conteúdo tem proporção ${aspect.toFixed(2)} (horizontal/estreito). Confirme que é um símbolo, não um wordmark.`);
  }
  if (cw < 128 || ch < 128) {
    summary.upscaledFrom = `${cw}x${ch}`;
    console.warn(`[generate-icon] AVISO: fonte ${cw}x${ch} é pequena; será ampliada até 256px (upscaling aceitável mas documentado em docs/PACKAGING.md).`);
  }
  const region = data.subarray((minY * W + minX) * 4, (maxY * W + maxX + 1) * 4);
  return { region, cw, ch, W, H };
}

async function compose(region, cw, ch) {
  const fitted = Math.round(CANVAS * CONTENT_FRAC);
  const scale = fitted / Math.max(cw, ch);
  const rw = Math.max(1, Math.round(cw * scale));
  const rh = Math.max(1, Math.round(ch * scale));
  const sized = await sharp(region, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(rw, rh, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sized.data, raw: { width: rw, height: rh, channels: 4 }, left: Math.round((CANVAS - rw) / 2), top: Math.round((CANVAS - rh) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { base, rw, rh };
}

async function main() {
  let src;
  try {
    src = await readFile(INPUT);
  } catch {
    fail(`Não encontrei build/symbol.png. Coloque o símbolo oficial da ClickIT (PNG com fundo transparente) em build/symbol.png e rode novamente.`);
  }
  const { region, cw, ch } = await analyze(src);
  const { base } = await compose(region, cw, ch);
  const entries = [];
  for (const size of SIZES) {
    const png = size === CANVAS ? base : await sharp(base).resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    entries.push({ size, bytes: png });
  }
  const icoBuf = ico(entries);
  const hash = sha256(icoBuf);
  const pngHash = sha256(base);
  if (CHECK) {
    let current = null;
    try { current = await readFile(OUT); } catch { current = null; }
    const ok = current !== null && sha256(current) === hash;
    console.log(`[generate-icon] check=${ok ? 'OK' : 'MISMATCH'} sha256=${hash}`);
    if (!ok) {
      if (current === null) fail(`build/icon.ico ainda não existe (rode sem --check para gerar).`);
      fail(`build/icon.ico não reproduz a mesma saída.`);
    }
    return;
  }
  await writeFile(OUT, icoBuf);
  await writeFile(PREVIEW, base);
  summary.output = { icon: OUT, iconSha256: hash, iconBytes: icoBuf.length, preview: PREVIEW, previewSha256: pngHash, sizes: SIZES };
  console.log(`[generate-icon] OK -> build/icon.ico (${icoBuf.length} bytes, sha256 ${hash})`);
  console.log(`[generate-icon] preview -> build/icon.png (${base.length} bytes, sha256 ${pngHash})`);
  console.log(`[generate-icon] summary=${JSON.stringify(summary)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});