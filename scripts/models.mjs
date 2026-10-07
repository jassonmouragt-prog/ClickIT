import { mkdir, open, rename, unlink, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dinov2Contract from '../src/ai/dinov2-contract.json' with { type: 'json' };
import nimaSourceLock from './models/nima-source.lock.json' with { type: 'json' };

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const catalog = JSON.parse(await readFile(path.join(root, 'scripts/models.lock.json'), 'utf8'));
Object.assign(catalog.models.dinov2, dinov2Contract);
const lockedNimaSource = nimaSourceLock.localSourceArtifact;
const nimaSourceManifestEntry = {
  name: 'NIMA MobileNet Aesthetic AVA original weights',
  file: lockedNimaSource.file,
  bytes: lockedNimaSource.bytes,
  sha256: lockedNimaSource.sha256,
  gitBlobSha1: lockedNimaSource.gitBlobSha1,
  source: `https://github.com/${nimaSourceLock.repository}/blob/${nimaSourceLock.sourceCommit}/${nimaSourceLock.officialFiles.weights.path}`,
  license: nimaSourceLock.license,
};

export async function verifyFile(file, entry) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  if (bytes !== entry.bytes || hash.digest('hex') !== entry.sha256) throw new Error(`Tamanho/SHA-256 divergente: ${entry.file}`);
}

export async function httpsResponse(url) {
  for (let redirects = 0; redirects <= 8; redirects++) {
    if (new URL(url).protocol !== 'https:') throw new Error('Downloads exigem HTTPS.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(300000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirecionamento sem destino.');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Download HTTP ${response.status}`);
    return response;
  }
  throw new Error('Redirecionamentos demais.');
}

export async function install(entry, directory, download = httpsResponse) {
  const target = path.join(directory, entry.file);
  try { await verifyFile(target, entry); console.log('PASS: existente, tamanho e SHA-256 corretos.'); return false; }
  catch (error) { if (error.code && error.code !== 'ENOENT') throw error; }
  const temporary = `${target}.${randomUUID()}.partial`;
  let handle;
  try {
    console.log('Downloading...');
    const response = await download(entry.url);
    handle = await open(temporary, 'wx');
    let bytes = 0, lastPercent = -1;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > entry.bytes) throw new Error('Download maior que o tamanho fixado.');
      await handle.writeFile(chunk);
      const percent = Math.floor(bytes * 100 / entry.bytes);
      if (percent >= lastPercent + 5 || percent === 100) {
        console.log(`${'█'.repeat(Math.floor(percent / 5)).padEnd(20, '░')} ${percent}%`); lastPercent = percent;
      }
    }
    await handle.sync(); await handle.close(); handle = undefined;
    console.log('Verifying SHA-256...');
    await verifyFile(temporary, entry);
    // Same-filesystem rename; never delete the old target first.
    await rename(temporary, target);
    console.log('PASS'); return true;
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function verifyModels(directory = path.join(root, 'resources/models')) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== catalog.version || !manifest.models) throw new Error('Manifesto de modelos inválido.');
  for (const [name, entry] of Object.entries(catalog.models)) {
    if (JSON.stringify(manifest.models[name]) !== JSON.stringify(entry)) throw new Error(`Manifesto diverge do catálogo fixado: ${name}.`);
  }
  for (const entry of Object.values(catalog.models)) await verifyFile(path.join(directory, entry.file), entry);
  const optional = Object.entries(manifest.models).filter(([name]) => !(name in catalog.models));
  for (const [name, entry] of optional) {
    if (!entry || typeof entry.file !== 'string' || path.basename(entry.file) !== entry.file ||
        !Number.isSafeInteger(entry.bytes) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Entrada opcional inválida no manifesto: ${name}.`);
    }
    await verifyFile(path.join(directory, entry.file), entry);
  }
  for (const [name, entry] of Object.entries(manifest.sourceArtifacts ?? {})) {
    if (!entry || typeof entry.file !== 'string' || path.basename(entry.file) !== entry.file ||
        !Number.isSafeInteger(entry.bytes) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Artefato de origem inválido no manifesto: ${name}.`);
    }
    await verifyFile(path.join(directory, entry.file), entry);
  }
  const installedSource = manifest.sourceArtifacts?.[lockedNimaSource.key];
  if (JSON.stringify(installedSource) !== JSON.stringify(nimaSourceManifestEntry)) {
    throw new Error('NIMA source artifact diverges from scripts/models/nima-source.lock.json.');
  }
  const sourceFiles = Object.values(manifest.sourceArtifacts ?? {}).map(entry => entry.file);
  return [...Object.values(catalog.models).map(entry => entry.file), ...optional.map(([, entry]) => entry.file), ...sourceFiles];
}

async function setup() {
  console.log('ClickIT Model Setup');
  const directory = path.join(root, 'resources/models');
  await mkdir(directory, { recursive: true });
  let failures = 0;
  for (const entry of Object.values(catalog.models)) {
    console.log(`\n${entry.name}`);
    try { await install(entry, directory); }
    catch (error) { failures++; console.error(`FAIL: ${error.message}; ${error.cause?.code ?? error.code ?? ''}`); }
  }
  if (failures) throw new Error(`${failures} modelo(s) não instalado(s). Nenhum arquivo parcial foi aprovado.`);
  const previousPath = path.join(directory, 'manifest.json');
  let optionalModels = {};
  await verifyFile(path.join(directory, nimaSourceManifestEntry.file), nimaSourceManifestEntry);
  let sourceArtifacts = { [lockedNimaSource.key]: nimaSourceManifestEntry };
  try {
    const previous = JSON.parse(await readFile(previousPath, 'utf8'));
    for (const [name, entry] of Object.entries(previous.models ?? {})) {
      if (name in catalog.models) continue;
      await verifyFile(path.join(directory, entry.file), entry);
      optionalModels[name] = entry;
    }
    for (const [name, entry] of Object.entries(previous.sourceArtifacts ?? {})) {
      if (name === lockedNimaSource.key) {
        if (JSON.stringify(entry) !== JSON.stringify(nimaSourceManifestEntry)) throw new Error('NIMA source artifact diverges from its locked provenance.');
        continue;
      }
      if (!entry || typeof entry.file !== 'string' || path.basename(entry.file) !== entry.file ||
          !Number.isSafeInteger(entry.bytes) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        throw new Error(`Artefato de origem inválido no manifesto: ${name}.`);
      }
      await verifyFile(path.join(directory, entry.file), entry);
      sourceArtifacts[name] = entry;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const completeManifest = {
    ...catalog,
    models: { ...catalog.models, ...optionalModels },
    ...(Object.keys(sourceArtifacts).length ? { sourceArtifacts } : {}),
  };
  const temporary = path.join(directory, `manifest.${randomUUID()}.partial`);
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(completeManifest, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path.join(directory, 'manifest.json'));
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  await verifyModels(directory);
  console.log('\nModels ready.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await setup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
