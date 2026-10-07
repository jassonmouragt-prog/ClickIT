import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { faceProbe } from './face-probe.mjs';
import { sharpness, regionalSharpness, exposure, makeAnalysis } from '../src/ai/quality.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetRoot = path.join(root, 'Validation Datasets');
const sourceDir = path.join(root, 'Imagens Teste');
const files = await readdir(sourceDir);
const pick = suffix => { const match = files.find(name => name.endsWith(suffix)); if (!match) throw new Error(`Fonte não encontrada: ${suffix}`); return path.join(sourceDir, match); };
const P1 = pick('09_01_00-1.png'), P2 = pick('09_01_01-2.png'), P3 = pick('09_01_03-3.png'), P4 = pick('09_01_05-4.png'), P5 = pick('09_01_07-5.png');
const W = 1448, H = 1086;
const rects = {
  p1: { left: 0.3683271110057831, top: 0.20937460660934448, width: 0.30168452858924866, height: 0.4859272837638855 },
  p2: { left: 0.36965447664260864, top: 0.2202540636062622, width: 0.3004773259169036, height: 0.47066861391067505 },
  p4: { left: 0.36776241660118103, top: 0.20706984400749207, width: 0.2999514043331146, height: 0.47922053933143616 },
  p5: { left: 0.3590554893016815, top: 0.20544561743736267, width: 0.29675307869911194, height: 0.4708339273929596 }
};

async function previewBuffer(file) {
  return sharp(file).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

async function wallColor(file) {
  const { data, info } = await sharp(file).extract({ left: 0, top: 0, width: 200, height: 60 }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0;
  const count = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

function headCrop(rect) {
  const margin = { left: 110, right: 110, top: 130, bottom: 120 };
  const left = Math.max(0, Math.round(rect.left * W - margin.left));
  const top = Math.max(0, Math.round(rect.top * H - margin.top));
  const right = Math.min(W, Math.round((rect.left + rect.width) * W + margin.right));
  const bottom = Math.min(H, Math.round((rect.top + rect.height) * H + margin.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

async function compositeTwo(fileA, rectA, fileB, rectB, options) {
  const { gapX = 120, shiftX = 0, scale = 1, background } = options;
  const cropA = await sharp(fileA).extract(headCrop(rectA)).toBuffer();
  const cropB = await sharp(fileB).extract(headCrop(rectB)).toBuffer();
  const metaA = await sharp(cropA).metadata(), metaB = await sharp(cropB).metadata();
  const wA = Math.round(metaA.width * scale), hA = Math.round(metaA.height * scale);
  const wB = Math.round(metaB.width * scale), hB = Math.round(metaB.height * scale);
  const canvasW = Math.max(1600, wA + wB + gapX * 3), canvasH = Math.max(1000, Math.max(hA, hB) + 120);
  const leftA = Math.max(0, gapX * 2 + shiftX), leftB = Math.min(canvasW - wB, canvasW - gapX * 2 - wB + shiftX);
  const resizedA = await sharp(cropA).resize(wA, hA).toBuffer(), resizedB = await sharp(cropB).resize(wB, hB).toBuffer();
  return sharp({ create: { width: canvasW, height: canvasH, channels: 3, background } })
    .composite([{ input: resizedA, left: leftA, top: Math.round((canvasH - hA) / 2) }, { input: resizedB, left: leftB, top: Math.round((canvasH - hB) / 2) }])
    .png().toBuffer();
}

async function groundTruth(file, temporaryDir) {
  const preview = await previewBuffer(file);
  const previewPath = path.join(temporaryDir, `${path.basename(file)}.preview.jpg`);
  await writeFile(previewPath, preview);
  const { data, info } = await sharp(previewPath).resize(512, 512, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const probe = await faceProbe(previewPath, false, true);
  const faces = Array.isArray(probe.productionFaces) ? probe.productionFaces : [];
  const analysis = makeAnalysis(sharpness(data, info.width, info.height), regionalSharpness(data, info.width, info.height), exposure(data), faces, true, true);
  const eyes = faces.length ? faces.some(face => face.eyes === 'CLOSED') ? 'CLOSED' : faces.every(face => face.eyes === 'OPEN') ? 'OPEN' : 'UNCERTAIN' : null;
  return { analysis, eyes, facesCount: faces.length };
}

function labelsFor(ground, extra) {
  const labels = [...extra];
  if (ground.eyes === 'CLOSED') labels.push('closed-eyes');
  else if (ground.eyes === 'OPEN') labels.push('open-eyes');
  if (ground.analysis.blur === 'UNCERTAIN') labels.push('soft-focus');
  else if (ground.analysis.blur === 'CLEAR' && ground.eyes === 'OPEN') labels.push('technically-good');
  labels.push('same-sequence');
  return labels;
}

async function buildDataset(name, description, photos) {
  const directory = path.join(targetRoot, name);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const temporaryDir = path.join(root, '.test-tmp', 'groundtruth', name);
  await rm(temporaryDir, { recursive: true, force: true });
  await mkdir(temporaryDir, { recursive: true });
  const manifest = { name, description, photos: [] };
  for (const photo of photos) {
    const file = path.join(directory, photo.file);
    await writeFile(file, photo.buffer);
    const ground = await groundTruth(file, temporaryDir);
    manifest.photos.push({ file: photo.file, labels: labelsFor(ground, photo.labels), humanRank: null });
    console.log(`${name}/${photo.file} | eyes=${ground.eyes ?? 'none'} | blur=${ground.analysis.blur} | overall=${ground.analysis.overall} | faces=${ground.facesCount} | labels=${manifest.photos.at(-1).labels.join(',')}`);
  }
  await writeFile(path.join(directory, 'dataset.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const background = await wallColor(P1);

const a1 = await previewBuffer(P1);
const a2 = await previewBuffer(P2);
const a3 = await previewBuffer(P3);
const a4 = await previewBuffer(P4);
const a5 = await previewBuffer(P5);

await buildDataset('portrait-expression-01', 'Dataset A — retrato/expressão: mesma pessoa, mesmo ambiente, enquadramento próximo; variações de expressão/pose reais das 5 gerações + 1 variação de foco suave + 1 reenquadramento leve.', [
  { file: '01.png', labels: [], buffer: a1 },
  { file: '02.png', labels: [], buffer: a2 },
  { file: '03.png', labels: [], buffer: a3 },
  { file: '04.png', labels: [], buffer: a4 },
  { file: '05.png', labels: [], buffer: a5 },
  { file: '06.png', labels: [], buffer: await sharp(a1).blur(1.6).png().toBuffer() },
  { file: '07.png', labels: [], buffer: await sharp(a4).extract({ left: 58, top: 44, width: 1332, height: 999 }).png().toBuffer() }
]);

const couple = async (fileA, rectA, fileB, rectB, options) => compositeTwo(fileA, rectA, fileB, rectB, { ...options, background });
await buildDataset('couple-event-01', 'Dataset B — casal/evento (proxy: duas instâncias faciais compostas das fotos disponíveis, mesma cena): sequência semelhante, uma instância com olhos fechados na foto 04, pequenas mudanças de enquadramento/escala.', [
  { file: '01.png', labels: ['two-subjects'], buffer: await couple(P1, rects.p1, P4, rects.p4, { gapX: 120 }) },
  { file: '02.png', labels: ['two-subjects'], buffer: await couple(P1, rects.p1, P4, rects.p4, { gapX: 120, shiftX: -50 }) },
  { file: '03.png', labels: ['two-subjects'], buffer: await couple(P1, rects.p1, P4, rects.p4, { gapX: 120, shiftX: 50 }) },
  { file: '04.png', labels: ['two-subjects'], buffer: await couple(P1, rects.p1, P2, rects.p2, { gapX: 120 }) },
  { file: '05.png', labels: ['two-subjects'], buffer: await couple(P5, rects.p5, P4, rects.p4, { gapX: 120 }) },
  { file: '06.png', labels: ['two-subjects'], buffer: await couple(P1, rects.p1, P4, rects.p4, { gapX: 240 }) },
  { file: '07.png', labels: ['two-subjects'], buffer: await couple(P1, rects.p1, P4, rects.p4, { gapX: 120, scale: 1.08 }) }
]);

const extract = (buffer, region) => sharp(buffer).extract(region).png().toBuffer();
const extend = (buffer, edges) => sharp(buffer).extend({ background, ...edges }).png().toBuffer();
const c0 = await previewBuffer(P4);
await buildDataset('composition-01', 'Dataset C — composição: mesmo assunto (base -4), variações de enquadramento: centralizado, deslocado, espaço negativo, crop fechado/aberto; qualidade técnica semelhante.', [
  { file: '01.png', labels: ['subject-centered'], buffer: c0 },
  { file: '02.png', labels: ['subject-offcenter'], buffer: await extract(c0, { left: 290, top: 0, width: 1158, height: 1086 }) },
  { file: '03.png', labels: ['subject-offcenter'], buffer: await extract(c0, { left: 0, top: 0, width: 1158, height: 1086 }) },
  { file: '04.png', labels: ['more-headroom'], buffer: await extract(c0, { left: 0, top: 0, width: 1448, height: 955 }) },
  { file: '05.png', labels: ['tight-crop'], buffer: await extract(c0, { left: 402, top: 69, width: 695, height: 832 }) },
  { file: '06.png', labels: ['open-crop'], buffer: await extend(c0, { top: 217, bottom: 217, left: 217, right: 217 }) },
  { file: '07.png', labels: ['negative-space'], buffer: await extend(c0, { top: 0, bottom: 0, left: 116, right: 405 }) },
  { file: '08.png', labels: ['negative-space'], buffer: await extend(c0, { top: 239, bottom: 54, left: 0, right: 0 }) }
]);

console.log(`Datasets gravados em: ${targetRoot}`);
