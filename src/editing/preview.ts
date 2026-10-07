import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { canonicalJson } from './contracts.ts';
import { PREVIEW_ENGINE_VERSION, PREVIEW_JPEG_QUALITY, PREVIEW_MAX_WIDTH, PREVIEW_RENDER_MAP } from './preview-map.ts';

// Fase D — EditingPreviewEngine (isolado do pipeline de selecao).
//
// Entrada: preview base em cache (JPEG, nunca o RAW/original) + photoHash +
// inputFingerprint do EditingPlan + valores efetivos (sugestao + overrides manuais).
// Saida: JPEG de preview editado em cache proprio + fingerprint + tempos.
// O arquivo original/RAW/JPEG de origem e SOMENTE lIDO (via preview em cache);
// nenhum caminho de origem e escrito por este motor.
//
// Cache separado da analise: chave = sha256 dos componentes abaixo (ver previewFingerprint).
// Qualquer componente muda -> outro arquivo -> preview anterior nao e mais servido.

export class PreviewCancelledError extends Error {
  constructor() { super('Prévia de edição cancelada por nova alteração.'); }
}

export interface PreviewRenderInput {
  basePreviewPath: string;
  photoHash: string;
  inputFingerprint: string;
  values: Record<string, number>;   // somente suportados != 0 (effectiveAdjustments().values)
  cacheDir: string;
  shouldCancel?: () => boolean;
}
export interface PreviewRenderOutcome {
  fingerprint: string; file: string; url: string; cached: boolean; renderMs: number;
}
export function previewUrl(fingerprint: string): string { return `clickit://edited/${fingerprint}`; }

export async function previewFingerprint(input: Omit<PreviewRenderInput, 'cacheDir' | 'shouldCancel'>): Promise<string> {
  let base: { size: number; mtimeMs: number };
  try { base = await stat(input.basePreviewPath); }
  catch { throw new Error('Prévia base da foto indisponível. Gere os previews antes de usar a prévia de edição.'); }
  const components = [
    String(PREVIEW_ENGINE_VERSION), String(PREVIEW_MAX_WIDTH), input.photoHash,
    input.inputFingerprint, canonicalJson(input.values), String(base.size), String(Math.round(base.mtimeMs)),
  ];
  return createHash('sha256').update(components.join('|')).digest('hex');
}

const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;
const ROW_CHUNK = 48;
function noise(pixel: number): number {
  // PRNG deterministico por pixel: mesmo fingerprint -> mesma imagem.
  let h = Math.imul(pixel + 1, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
async function adjustPixels(data: Buffer, out: Buffer, width: number, height: number, channels: number, values: Record<string, number>, shouldCancel?: () => boolean): Promise<void> {
  const m = PREVIEW_RENDER_MAP;
  const gain = values.exposurePreference ? Math.pow(2, (values.exposurePreference / 100) * m.exposureStops) : 1;
  const contrast = values.contrastPreference ? 1 + (values.contrastPreference / 100) * m.contrastAmount : 1;
  const shadows = ((values.shadowsPreference ?? 0) / 100) * m.shadowsAmount;
  const highlights = ((values.highlightsPreference ?? 0) / 100) * m.highlightsAmount;
  const whites = ((values.whitesPreference ?? 0) / 100) * m.whitesAmount;
  const blacks = ((values.blacksPreference ?? 0) / 100) * m.blacksAmount;
  const saturation = ((values.saturationPreference ?? 0) / 100) * m.saturationFull;
  const vibrance = ((values.vibrancePreference ?? 0) / 100) * m.vibranceAmount;
  const grain = ((values.grainPreference ?? 0) / 100) * m.grainAmount;
  const vignette = ((values.vignettePreference ?? 0) / 100) * m.vignetteAmount;
  const toneActive = shadows !== 0 || highlights !== 0 || whites !== 0 || blacks !== 0;
  const colorActive = saturation !== 0 || vibrance !== 0;
  const vigDark = vignette > 0 ? vignette : 0;
  const vigLight = vignette < 0 ? -vignette : 0;
  const cx = (width - 1) / 2, cy = (height - 1) / 2;
  const rx = Math.max(cx, 1), ry = Math.max(cy, 1);
  const start = m.vignetteStart;
  const total = width * height;
  for (let y0 = 0; y0 < height; y0 += ROW_CHUNK) {
    if (shouldCancel?.()) throw new PreviewCancelledError();
    const end = Math.min(total, (y0 + ROW_CHUNK) * width);
    for (let p = y0 * width; p < end; p++) {
      const si = p * channels;
      let r = (data[si] ?? 0) / 255;
      let g = channels >= 3 ? (data[si + 1] ?? 0) / 255 : r;
      let b = channels >= 3 ? (data[si + 2] ?? 0) / 255 : r;
      if (gain !== 1) { r *= gain; g *= gain; b *= gain; }
      if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
      let l = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      if (toneActive) {
        // Uma unica etapa tonal, calculada a partir da luminancia pos-exposicao:
        // pretos/brancos (extremos) + sombras/altas luzes (faixas amplas).
        const shift = blacks * Math.pow(1 - l, 6) + whites * Math.pow(l, 6) + shadows * Math.pow(1 - l, 2) + highlights * Math.pow(l, 3);
        r += shift; g += shift; b += shift;
        if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
        if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
      }
      if (contrast !== 1) {
        r = 0.5 + (r - 0.5) * contrast; g = 0.5 + (g - 0.5) * contrast; b = 0.5 + (b - 0.5) * contrast;
        if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
        if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
      }
      if (colorActive) {
        l = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        let s = saturation;
        if (vibrance !== 0) {
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          s += vibrance * (1 - (mx - mn)); // vibrance = saturacao ponderada pela croma existente (sem protecao de pele — limitacao documentada)
        }
        if (s !== 0) {
          r = l + (r - l) * (1 + s); g = l + (g - l) * (1 + s); b = l + (b - l) * (1 + s);
          if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
          if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
        }
      }
      if (grain !== 0) {
        const n = noise(p) * grain;
        r += n; g += n; b += n;
        if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
        if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
      }
      if (vigDark !== 0 || vigLight !== 0) {
        const y = (p / width) | 0, x = p - y * width;
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > start) {
          let t = (d - start) / (1 - start);
          if (t > 1) t = 1;
          const mask = t * t * (3 - 2 * t);
          if (vigDark !== 0) { const k = vigDark * mask; r -= r * k; g -= g * k; b -= b * k; }
          else { const k = vigLight * mask; r += k * (1 - r); g += k * (1 - g); b += k * (1 - b); }
        }
      }
      const oi = p * 3;
      out[oi] = Math.round(r * 255); out[oi + 1] = Math.round(g * 255); out[oi + 2] = Math.round(b * 255);
    }
    if (end < total) await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  }
}
let writeCounter = 0;
export async function renderEditingPreview(input: PreviewRenderInput): Promise<PreviewRenderOutcome> {
  const started = Date.now();
  const fingerprint = await previewFingerprint(input);
  const file = path.join(input.cacheDir, `${fingerprint}.jpg`);
  const url = previewUrl(fingerprint);
  const cached = await stat(file).then(() => true, () => false);
  if (cached) return { fingerprint, file, url, cached: true, renderMs: Date.now() - started };
  if (input.shouldCancel?.()) throw new PreviewCancelledError();
  await mkdir(input.cacheDir, { recursive: true });
  const { data, info } = await sharp(input.basePreviewPath, { limitInputPixels: 150_000_000 })
    .resize({ width: PREVIEW_MAX_WIDTH, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (input.shouldCancel?.()) throw new PreviewCancelledError();
  const out = Buffer.allocUnsafe(info.width * info.height * 3);
  await adjustPixels(data, out, info.width, info.height, info.channels, input.values, input.shouldCancel);
  const meta = { width: info.width, height: info.height, channels: 3 as const };
  const m = PREVIEW_RENDER_MAP;
  const clarity = amount(input, 'clarityPreference'), texture = amount(input, 'texturePreference'), sharpening = amount(input, 'sharpeningPreference');
  const sigmas: number[] = [];
  if (clarity > 0) sigmas.push(1 + (clarity / 100) * (m.claritySigma - 1));
  if (texture > 0) sigmas.push(0.5 + (texture / 100) * (m.textureSigma - 0.5));
  if (sharpening > 0) sigmas.push(0.5 + (sharpening / 100) * (m.sharpeningSigma - 0.5));
  let blurSquares = 0;
  if (clarity < 0) blurSquares += Math.pow(1 + (-clarity / 100) * 4, 2);
  if (texture < 0) blurSquares += Math.pow(0.5 + (-texture / 100) * 2, 2);
  if (sharpening < 0) blurSquares += Math.pow(0.4 + (-sharpening / 100) * 1.6, 2);
  let current: Buffer = out;
  for (const sigma of sigmas) {
    if (input.shouldCancel?.()) throw new PreviewCancelledError();
    current = await sharp(current, { raw: meta }).sharpen(sigma).raw().toBuffer();
  }
  if (blurSquares > 0) {
    if (input.shouldCancel?.()) throw new PreviewCancelledError();
    current = await sharp(current, { raw: meta }).blur(Math.sqrt(blurSquares)).raw().toBuffer();
  }
  const jpeg = await sharp(current, { raw: meta }).jpeg({ quality: PREVIEW_JPEG_QUALITY }).toBuffer();
  const partial = `${file}.${process.pid}.${++writeCounter}.partial`;
  await writeFile(partial, jpeg); await rename(partial, file);
  return { fingerprint, file, url, cached: false, renderMs: Date.now() - started };
}
function amount(input: PreviewRenderInput, key: string): number { return input.values[key] ?? 0; }
