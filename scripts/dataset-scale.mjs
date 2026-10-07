import { mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { args, contained, filesIn, json, sha256, scales, scope } from './scale-common.mjs';

export function randomSeed(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export async function generate({ source, output, count, seed = 20261006 }) {
  source = path.resolve(source); output = path.resolve(output);
  if (!scales.includes(count)) throw new Error(`--count deve ser ${scales.join(', ')}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed deve ser inteiro uint32');
  if (contained(source, output) || contained(output, source)) throw new Error('Source e output devem ser pastas separadas, sem sobreposição.');
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Output deve estar vazio; nenhum arquivo existente será sobrescrito.');
  const sources = [], seen = new Set();
  for (const file of await filesIn(source)) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;
    const hash = await sha256(file);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const meta = await sharp(file).metadata();
    if (!meta.width || !meta.height) throw new Error(`Dimensões inválidas: ${file}`);
    sources.push({ file: path.relative(source, file).replaceAll('\\', '/'), sha256: hash, width: meta.width, height: meta.height });
  }
  if (!sources.length) throw new Error('Nenhuma imagem-base JPEG/PNG válida.');
  const random = randomSeed(seed), entries = [];
  const types = ['exact-copy', 'jpeg-recompress', 'crop-light', 'crop-moderate', 'brightness', 'exposure', 'blur-light', 'blur-moderate', 'resize', 'rotate', 'contrast', 'sharpen'];
  const offsets = sources.map(() => Math.floor(random() * types.length));
  sharp.cache({ memory: 32, files: 0, items: 20 }); sharp.concurrency(1);
  for (let i = 0; i < count; i++) {
    const sourceIndex = i % sources.length, base = sources[sourceIndex];
    const transformation = types[(Math.floor(i / sources.length) + offsets[sourceIndex]) % types.length];
    const parameters = {}, input = path.join(source, base.file);
    const file = `image-${String(i + 1).padStart(5, '0')}${transformation === 'exact-copy' ? path.extname(base.file).toLowerCase() : '.jpg'}`;
    const destination = path.join(output, file);
    let image = sharp(input);
    const value = (min, max) => Number((min + random() * (max - min)).toFixed(5));
    switch (transformation) {
      case 'exact-copy': await copyFile(input, destination); break;
      case 'jpeg-recompress': parameters.quality = Math.floor(value(76, 94)); break;
      case 'crop-light':
      case 'crop-moderate': {
        parameters.fraction = transformation === 'crop-light' ? value(0.93, 0.98) : value(0.78, 0.9);
        parameters.width = Math.max(1, Math.floor(base.width * parameters.fraction));
        parameters.height = Math.max(1, Math.floor(base.height * parameters.fraction));
        parameters.left = Math.floor((base.width - parameters.width) * random());
        parameters.top = Math.floor((base.height - parameters.height) * random());
        image = image.extract({ left: parameters.left, top: parameters.top, width: parameters.width, height: parameters.height }); break;
      }
      case 'brightness': parameters.offset = value(-8, 8); image = image.linear(1, parameters.offset); break;
      case 'exposure': parameters.ev = value(-0.18, 0.18); parameters.multiplier = 2 ** parameters.ev; image = image.linear(parameters.multiplier, 0); break;
      case 'blur-light': parameters.sigma = value(0.35, 0.65); image = image.blur(parameters.sigma); break;
      case 'blur-moderate': parameters.sigma = value(1, 1.6); image = image.blur(parameters.sigma); break;
      case 'resize': parameters.factor = value(0.7, 0.95); parameters.width = Math.max(1, Math.floor(base.width * parameters.factor)); image = image.resize({ width: parameters.width }); break;
      case 'rotate': parameters.degrees = value(-2, 2); parameters.background = '#808080'; image = image.rotate(parameters.degrees, { background: parameters.background }); break;
      case 'contrast': parameters.factor = value(0.94, 1.06); parameters.offset = 128 * (1 - parameters.factor); image = image.linear(parameters.factor, parameters.offset); break;
      case 'sharpen': parameters.sigma = value(0.4, 0.8); image = image.sharpen({ sigma: parameters.sigma }); break;
    }
    if (transformation !== 'exact-copy') {
      parameters.quality ??= 90;
      parameters.chromaSubsampling = '4:4:4';
      await image.jpeg({ quality: parameters.quality, chromaSubsampling: parameters.chromaSubsampling }).toFile(destination);
    }
    entries.push({ file, source: base.file, sourceSha256: base.sha256, trueGroup: `source-${sourceIndex + 1}`, transformation, parameters, sha256: await sha256(destination) });
    if ((i + 1) % 100 === 0) console.log(`Geradas ${i + 1}/${count}`);
  }
  const manifest = { schemaVersion: 1, generatorVersion: 1, seed, count, scope, reproducibility: 'Same input bytes + relative filenames + seed + count + recorded Sharp/libvips versions. No timestamps or absolute paths in manifest.', runtime: { node: process.versions.node, sharp: sharp.versions }, sources, entries };
  await json(path.join(output, 'dataset-scale-manifest.json'), manifest);
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = args(process.argv.slice(2), ['--source', '--output', '--count', '--seed']);
    if (!options['--source'] || !options['--output']) throw new Error('Uso: npm run dataset:scale -- --source PASTA --output PASTA --count 1000 [--seed 20261006]');
    await generate({ source: options['--source'], output: options['--output'], count: Number(options['--count'] ?? 1000), seed: Number(options['--seed'] ?? 20261006) });
  } catch (error) { console.error(error); process.exitCode = 1; }
}
