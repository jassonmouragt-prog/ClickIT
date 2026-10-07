import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkOnly = process.argv.includes('--check');

try {
  const patch = JSON.parse(await readFile(path.join(root, 'patches/app-builder-lib-26.15.3-nsis.json'), 'utf8'));
  for (const [name, expected] of Object.entries(patch.versions)) {
    const { version } = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
    if (version !== expected) throw new Error(`${name}: expected ${expected}, installed ${version}. Review the NSIS patch before changing dependencies.`);
  }
  const target = path.join(root, patch.file);
  const original = await readFile(target, 'utf8');
  const source = original.replace(/\r\n/g, '\n');
  const occurrences = text => source.split(text).length - 1;
  if (occurrences(patch.after) === 1 && occurrences(patch.before) === 1) {
    console.log('[nsis-patch] app-builder-lib 26.15.3: patch already applied and verified.');
  } else {
    if (occurrences(patch.after) !== 0 || occurrences(patch.before) !== 1) {
      throw new Error(`${patch.file}: expected source does not match; refusing to patch.`);
    }
    if (checkOnly) throw new Error('NSIS patch is missing. Run npm install/npm ci with lifecycle scripts enabled.');
    const result = source.replace(patch.before, patch.after);
    await writeFile(target, original.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result, 'utf8');
    console.log('[nsis-patch] app-builder-lib 26.15.3: Windows UninstallerReader patch applied.');
  }
} catch (error) {
  console.error(`[nsis-patch] FAILED: ${error.message}`);
  process.exitCode = 1;
}
