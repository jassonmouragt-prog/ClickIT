import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INPUT = path.join(ROOT, 'build', 'symbol.png');
const OUT = path.join(ROOT, 'build', 'icon.ico');
const PREVIEW = path.join(ROOT, 'build', 'icon.png');
const EVIDENCE = path.join(ROOT, 'docs', 'evidence', 'icon-sizes.png');
const FRAMES_DIR = path.join(ROOT, 'docs', 'evidence', 'icon-frames');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const EVIDENCE_SIZES = [16, 24, 32, 48, 64, 128, 256];
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

async function main() {
  let src;
  try {
    src = await readFile(INPUT);
  } catch {
    fail(`Não encontrei build/symbol.png. Coloque o símbolo oficial da ClickIT (PNG com fundo transparente) em build/symbol.png e rode novamente.`);
  }
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) {
    fail(`build/symbol.png precisa de canal alfa (fundo transparente). Recebido: ${meta.format} ${meta.width}x${meta.height} sem transparência.`);
  }

  // Recorte automático do conteúdo (remove bordas transparentes). Evita o bug
  // anterior de extração por subarray com stride incorreto.
  const trimmed = await sharp(src)
    .ensureAlpha()
    .trim({ threshold: 8 })
    .png()
    .toBuffer();
  const tMeta = await sharp(trimmed).metadata();
  const cw = tMeta.width;
  const ch = tMeta.height;
  const aspect = cw / ch;
  summary.source = {
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasAlpha: true,
    content: { w: cw, h: ch, aspect: Number(aspect.toFixed(3)) },
  };
  if (aspect > 1.35 || aspect < 0.75) {
    console.warn(`[generate-icon] AVISO: conteúdo tem proporção ${aspect.toFixed(2)} (horizontal/estreito). Confirme que é um símbolo, não um wordmark.`);
  }
  if (cw < 128 || ch < 128) {
    summary.upscaledFrom = `${cw}x${ch}`;
    console.warn(`[generate-icon] AVISO: fonte ${cw}x${ch} é pequena; será ampliada até 256px (upscaling aceitável mas documentado em docs/PACKAGING.md).`);
  }

  // Compõe o conteúdo centralizado em um canvas 256x256 transparente.
  const fitted = Math.round(CANVAS * CONTENT_FRAC);
  const sizedBuf = await sharp(trimmed)
    .resize(fitted, fitted, { fit: 'inside', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const sMeta = await sharp(sizedBuf).metadata();
  const rw = sMeta.width;
  const rh = sMeta.height;
  const base = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: sizedBuf,
        left: Math.round((CANVAS - rw) / 2),
        top: Math.round((CANVAS - rh) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Monta o ICO com um PNG por tamanho.
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
  summary.output = {
    icon: OUT,
    iconSha256: hash,
    iconBytes: icoBuf.length,
    preview: PREVIEW,
    previewSha256: pngHash,
    sizes: SIZES,
  };

  // Gera frames PNG individuais para inspeção visual.
  await mkdir(FRAMES_DIR, { recursive: true });
  const frames = [];
  for (const size of EVIDENCE_SIZES) {
    const png = size === CANVAS ? base : await sharp(base).resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(FRAMES_DIR, `${size}.png`), png);
    frames.push({ size, sha256: sha256(png) });
  }
  await buildEvidence(trimmed, frames);
  summary.evidence = { sheet: EVIDENCE, framesDir: FRAMES_DIR };

  console.log(`[generate-icon] OK -> build/icon.ico (${icoBuf.length} bytes, sha256 ${hash})`);
  console.log(`[generate-icon] preview -> build/icon.png (${base.length} bytes, sha256 ${pngHash})`);
  console.log(`[generate-icon] frames + evidence -> ${EVIDENCE}`);
  console.log(`[generate-icon] summary=${JSON.stringify(summary)}`);
}

function toDataUri(buf) {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function buildEvidence(sourceTrimmed, frames) {
  const cell = 140;
  const cols = 1 + frames.length;
  const W = cols * cell + (cols + 1) * 8;
  // Linha de cima: verdadeiro tamanho. Linha de baixo: zoom (~4x, cap 132).
  // Rodapé: legenda do tamanho.
  const H = cell * 2 + 28 + 8 * 3 + 22;
  const checker = `<pattern id="ck" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#ffffff"/><rect width="5" height="5" fill="#e3e7ee"/><rect x="5" y="5" width="5" height="5" fill="#e3e7ee"/></pattern>`;

  const column = (label, img, truePx) => {
    const px = truePx ?? 0; // 0 = source (usar 100% da célula)
    const zoom = px >= 128 ? 128 : px * 4;
    const imgTrue = px
      ? `<image x="${(cell - px) / 2}" y="${(cell - px) / 2}" width="${px}" height="${px}" href="${img}" image-rendering="pixelated"/>`
      : `<image x="${(cell - 100) / 2}" y="${(cell - 100) / 2}" width="100" height="100" href="${img}" image-rendering="pixelated"/>`;
    const imgZoom = px
      ? `<image x="${(cell - zoom) / 2}" y="${8 + (cell - zoom) / 2}" width="${zoom}" height="${zoom}" href="${img}" image-rendering="pixelated"/>`
      : '';
    return `<g><rect x="0" y="0" width="${cell}" height="${cell}" fill="url(#ck)"/>${imgTrue}<rect x="0" y="${cell + 8}" width="${cell}" height="${cell}" fill="url(#ck)"/>${imgZoom}<text x="${cell / 2}" y="${cell * 2 + 22}" font-size="12" fill="#111" text-anchor="middle" font-family="monospace">${label}</text></g>`;
  };

  const sourceUri = toDataUri(sourceTrimmed);
  const parts = [column('OFFICIAL\nSOURCE', sourceUri, 0)];
  for (const f of frames) {
    const buf = await readFile(path.join(FRAMES_DIR, `${f.size}.png`));
    parts.push(column(`${f.size}px`, toDataUri(buf), f.size));
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>${checker}</defs>
  <rect width="${W}" height="${H}" fill="#f5f7fa"/>
  ${parts
    .map((p, i) => `<g transform="translate(${8 + i * (cell + 8)},8)">${p}</g>`)
    .join('\n')}
  <text x="${8}" y="${H - 6}" font-size="11" fill="#666" font-family="monospace">true size (topo) + zoom ~4x (fundo em branco = transparente)</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await mkdir(path.dirname(EVIDENCE), { recursive: true });
  await writeFile(EVIDENCE, png);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});