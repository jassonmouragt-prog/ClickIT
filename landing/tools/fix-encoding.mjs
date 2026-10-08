import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'src');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const fixed = [];
const files = (await walk(root)).filter((file) => ['.ts', '.tsx', '.css'].includes(extname(file)));

for (const file of files) {
  const buffer = await readFile(file);
  const bytes = buffer;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
    await writeFile(file, text, 'utf8');
    fixed.push(`${file} (utf16 -> utf8)`);
    continue;
  }
  try {
    utf8.decode(bytes);
  } catch {
    const text = new TextDecoder('windows-1252').decode(bytes);
    await writeFile(file, text, 'utf8');
    fixed.push(`${file} (cp1252 -> utf8)`);
  }
}

console.log(fixed.length ? fixed.join('\n') : 'all files already valid utf-8');
