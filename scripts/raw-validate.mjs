import { mkdir, writeFile, rm, readdir, link, copyFile, stat, open } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ExifTool } from 'exiftool-vendored';
import { Pipeline } from '../src/services/pipeline.ts';
import { Store } from '../src/database/store.ts';
import { exportPhotos } from '../src/services/export.ts';
import { RAW } from '../src/lib/files.ts';
import { root, verifyModels } from './models.mjs';
import { faceProbe } from './face-probe.mjs';

const EXPECTED_FORMATS = ['.cr2', '.cr3', '.nef', '.arw', '.dng'];

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--dir' || !args[1] || args[1].startsWith('--')) throw new Error('Uso: npm run raw:validate -- --dir "C:\\fotos\\raw"');
  return path.resolve(args[1]);
}

async function fileSha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function detectContainer(file, extension) {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);
    if (bytesRead < 12) return { magicOk: false, container: 'too-short' };
    const tiffLE = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const tiffBE = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    if (extension === '.cr3') {
      const ftyp = buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
      const brandCrx = buffer[8] === 0x63 && buffer[9] === 0x72 && buffer[10] === 0x78;
      return { magicOk: ftyp && brandCrx, container: ftyp ? 'ftyp-crx' : 'not-ftyp' };
    }
    if (extension === '.cr2') {
      const crMarker = buffer[8] === 0x43 && buffer[9] === 0x52;
      return { magicOk: (tiffLE || tiffBE) && crMarker, container: tiffLE || tiffBE ? 'tiff-cr2' : 'not-tiff' };
    }
    return { magicOk: tiffLE || tiffBE, container: tiffLE ? 'tiff-le' : tiffBE ? 'tiff-be' : 'not-tiff' };
  } finally { await handle.close(); }
}

async function collectRaw(dir) {
  const files = [];
  const walkDir = async current => {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walkDir(full);
      else if (entry.isFile() && RAW.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  await walkDir(dir);
  return files.sort((a, b) => a.localeCompare(b));
}

async function validateFiles(files) {
  const stamp = Date.now();
  const workspace = path.join(root, '.test-tmp', `raw-validate-${stamp}`);
  const staging = path.join(workspace, 'staging');
  const exportDir = path.join(workspace, 'export');
  await mkdir(staging, { recursive: true });
  const exif = new ExifTool({ maxProcs: 1 });
  const perFile = [];
  const originalShaBefore = new Map();
  try {
    const stagedMap = new Map();
    for (const [index, file] of files.entries()) {
      originalShaBefore.set(file, await fileSha256(file));
      const staged = path.join(staging, `${String(index).padStart(2, '0')}-${path.basename(file)}`);
      try { await link(file, staged); } catch { await copyFile(file, staged); }
      stagedMap.set(file, staged);
    }
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      const staged = stagedMap.get(file);
      const row = { file, staged, extension, size: (await stat(file)).size };
      row.magic = await detectContainer(staged, extension);
      const exifStart = performance.now();
      try {
        const tags = await exif.read(staged);
        row.exif = { ok: true, ms: performance.now() - exifStart, captureDate: tags?.DateTimeOriginal ? String(tags.DateTimeOriginal) : null, camera: tags?.Model ? String(tags.Model) : null, lens: tags?.LensModel ? String(tags.LensModel) : null, iso: tags?.ISO ?? null };
      } catch (error) { row.exif = { ok: false, ms: performance.now() - exifStart, error: error.message }; }
      const extractStart = performance.now();
      row.previewExtraction = { ok: false, ms: 0, tag: null, embeddedBytes: 0 };
      for (const tag of ['JpgFromRaw', 'PreviewImage', 'OtherImage']) {
        const temporary = path.join(workspace, `extract-${path.basename(file)}-${tag}.jpg`);
        try {
          await exif.extractBinaryTag(tag, staged, temporary);
          row.previewExtraction = { ok: true, ms: performance.now() - extractStart, tag, embeddedBytes: (await stat(temporary)).size };
          await rm(temporary, { force: true });
          break;
        } catch { await rm(temporary, { force: true }); }
      }
      perFile.push(row);
    }
    await verifyModels();
    const store = new Store(path.join(workspace, 'raw.sqlite'));
    let project = null;
    const faceTimings = [];
    const pipelineErrors = [];
    try {
      project = store.create('RAW validation', staging);
      const pipeline = new Pipeline({
        store, model: path.join(root, 'resources/models/dinov2-small.onnx'), concurrency: 1,
        workerFile: path.join(root, 'src/workers/analysis.ts'), groupingFile: path.join(root, 'src/workers/grouping.ts'), cache: path.join(workspace, 'cache'),
        faces: async (id, preview) => {
          const started = performance.now();
          try {
            const result = await faceProbe(preview, false, true);
            if (!Array.isArray(result.productionFaces)) throw new Error('Postprocessing facial de produção ausente.');
            return result.productionFaces;
          } catch (error) { pipelineErrors.push({ photoId: id, stage: 'face-renderer', error: error.message }); throw error; }
          finally { faceTimings.push(performance.now() - started); }
        },
        emit: progress => { if (!progress.active) console.log(`[raw] ${progress.stage} ${progress.done}/${progress.total} falhas=${progress.failed}`); },
        log: (event, details) => pipelineErrors.push({ event, ...details })
      });
      const pipelineStart = performance.now();
      await pipeline.index(project.id);
      await pipeline.analyze(project.id);
      const pipelineMs = performance.now() - pipelineStart;
      const photos = store.photos(project.id);
      const exportStart = performance.now();
      const exported = await exportPhotos(photos, exportDir, 'COPY', () => false, () => {});
      const exportMs = performance.now() - exportStart;
      const exportEntries = await readdir(exportDir);
      for (const row of perFile) {
        const photo = photos.find(item => item.originalPath === row.staged);
        row.pipeline = photo ? {
          status: photo.analysisStatus, error: photo.error ?? null,
          captureDate: photo.captureDate ?? null, metadata: photo.metadata ?? {}, camera: photo.metadata?.camera ?? null,
          hasPreview: !!(photo.previewPath && existsSync(photo.previewPath)), hasThumbnail: !!(photo.thumbnailPath && existsSync(photo.thumbnailPath)),
          previewBytes: photo.previewPath && existsSync(photo.previewPath) ? (await stat(photo.previewPath)).size : 0,
          analysisVersion: photo.analysis?.version ?? null, embeddingAvailable: !!photo.analysis?.embeddingAvailable,
          grouped: !!photo.groupId
        } : { status: 'NOT_INDEXED', error: 'Arquivo não indexado', captureDate: null, metadata: {}, camera: null, hasPreview: false, hasThumbnail: false, previewBytes: 0, analysisVersion: null, embeddingAvailable: false, grouped: false };
        if (photo) {
          const exportedFile = exportEntries.find(name => name.includes(`_${photo.id.slice(0, 8)}_`) && name.endsWith(photo.extension));
          row.export = exportedFile
            ? { copied: true, exportedFile, shaOriginal: originalShaBefore.get(row.file), shaExported: await fileSha256(path.join(exportDir, exportedFile)), ms: 0 }
            : { copied: false, exportedFile: null, shaOriginal: originalShaBefore.get(row.file), shaExported: null, ms: 0 };
          row.export.identical = !!row.export.shaExported && row.export.shaExported === row.export.shaOriginal;
        } else row.export = { copied: false, exportedFile: null, shaOriginal: originalShaBefore.get(row.file), shaExported: null, identical: false, ms: 0 };
      }
      for (const row of perFile) {
        row.originalUntouched = (await fileSha256(row.file)) === row.export.shaOriginal;
        row.ok = row.magic.magicOk && row.exif.ok && row.previewExtraction.ok && row.pipeline.status === 'DONE' && row.pipeline.hasPreview && row.pipeline.hasThumbnail && row.export.identical && row.originalUntouched;
      }
      const summary = {
        totalFiles: perFile.length, pipelineMs, exportMs, exportResult: { copied: exported.copied, total: exported.total, errors: exported.errors },
        faceMsTotal: faceTimings.reduce((sum, value) => sum + value, 0), faceCalls: faceTimings.length, pipelineErrors
      };
      return { workspace, perFile, summary, store };
    } catch (error) {
      return { workspace, perFile, summary: { totalFiles: perFile.length, pipelineMs: 0, exportMs: 0, exportResult: null, faceMsTotal: 0, faceCalls: 0, pipelineErrors }, store, fatal: error.stack ?? String(error) };
    } finally { try { store.close(); } catch { /* já fechada */ } }
  } finally {
    try { await exif.end(); } catch { /* já encerrado */ }
  }
}

async function main() {
  let directory;
  try { directory = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error(`Pasta inválida: ${directory}`);
    const files = await collectRaw(directory);
    console.log(`RAW encontrados em ${directory}: ${files.length}`);
    const byFormat = new Map();
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (!byFormat.has(extension)) byFormat.set(extension, []);
      byFormat.get(extension).push(file);
    }
    const formats = [];
    for (const format of EXPECTED_FORMATS) {
      const formatFiles = byFormat.get(format);
      if (!formatFiles?.length) {
        formats.push({ format, status: 'NOT_TESTED', filesFound: 0, reason: 'Nenhum arquivo disponível para validação real (sem simulação).', perFile: [] });
        console.log(`${format}: NOT_TESTED (sem arquivos)`);
        continue;
      }
      console.log(`\n=== ${format} (${formatFiles.length} arquivo(s)) ===`);
      const result = await validateFiles(formatFiles);
      const pass = result.perFile.length > 0 && result.perFile.every(row => row.ok);
      const status = pass ? 'PASS' : 'FAIL';
      formats.push({ format, status, filesFound: formatFiles.length, fatal: result.fatal ?? null, summary: result.summary, perFile: result.perFile.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'staged'))) });
      for (const row of result.perFile) console.log(`${path.basename(row.file)}: ${row.ok ? 'PASS' : 'FAIL'} | magic=${row.magic.container} exif=${row.exif.ok} preview=${row.previewExtraction.ok}(${row.previewExtraction.tag}) pipeline=${row.pipeline?.status ?? 'ERROR'} exportIdentical=${row.export?.identical ?? false} untouched=${row.originalUntouched ?? false}`);
      await rm(result.workspace, { recursive: true, force: true }).catch(() => {});
    }
    const tested = formats.filter(item => item.status !== 'NOT_TESTED');
    const extraRawFormatsFound = [...byFormat.keys()].filter(extension => !EXPECTED_FORMATS.includes(extension));
    const evidence = {
      generatedAt: new Date().toISOString(), mode: 'RAW validation (real files only; no simulation; production code untouched)',
      command: `npm run raw:validate -- --dir "${directory}"`, directory,
      formats,
      summary: {
        expectedFormats: EXPECTED_FORMATS.length, testedFormats: tested.length, notTestedFormats: formats.length - tested.length,
        passed: tested.filter(item => item.status === 'PASS').length, failed: tested.filter(item => item.status === 'FAIL').length,
        extraRawFormatsFound,
        status: tested.every(item => item.status === 'PASS') ? (tested.length ? 'PASS' : 'NOT_TESTED') : 'FAIL'
      },
      notes: [
        'Formatação por extensão + verificação de magic bytes (TIFF para CR2/NEF/ARW/DNG; ftyp-crx para CR3).',
        'Extração de preview embutido (JpgFromRaw/PreviewImage/OtherImage) cronometrada, como no worker de produção.',
        'Análise via pipeline de produção (índice, previews, cache, embedding, rostos) em cópias hardlink em staging; exportação via exportPhotos com SHA-256 idêntico exigido.',
        'Original verificado por SHA-256 antes e depois (intocabilidade).'
      ]
    };
    await mkdir(path.join(root, 'docs/evidence'), { recursive: true });
    const file = path.join(root, 'docs/evidence', `raw-validation-${stamp}.json`);
    await writeFile(file, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`\nStatus: ${evidence.summary.status} | testados=${evidence.summary.testedFormats} NOT_TESTED=${evidence.summary.notTestedFormats} PASS=${evidence.summary.passed} FAIL=${evidence.summary.failed}`);
    console.log(`Evidência: ${path.relative(root, file)}`);
    console.log('RAW_VALIDATION_DONE');
    if (evidence.summary.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(error.stack ?? String(error));
    console.log('RAW_VALIDATION_DONE_WITH_ERROR');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
