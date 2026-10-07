import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { performance } from 'node:perf_hooks';

// Validation evidence only. Does not alter application behavior or package configuration.
const root = process.cwd();
const evidence = path.join(root, 'docs/evidence');
mkdirSync(evidence, { recursive: true });
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const results = [];
function run(label, executable, args) {
  const started = performance.now();
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const record = { label, executable, args, exitCode: result.status, signal: result.signal, elapsedMs: Math.round(performance.now() - started), error: result.error?.stack ?? null };
  writeFileSync(path.join(evidence, label + '.log'), JSON.stringify(record, null, 2) + '\nSTDOUT\n' + result.stdout + '\nSTDERR\n' + result.stderr);
  results.push(record);
  console.log(label, 'exit=', result.status);
  return result.stdout?.trim();
}
const config = { platform: process.platform, arch: process.arch, node: process.version, executable: process.execPath, cwd: root,
  npm: run('npm-version', process.execPath, [npmCli, '-v']),
  cache: run('npm-cache', process.execPath, [npmCli, 'config', 'get', 'cache']),
  prefix: run('npm-prefix', process.execPath, [npmCli, 'config', 'get', 'prefix']),
  pnpm: run('pnpm-location', 'where.exe', ['pnpm']),
  nodeModules: existsSync('node_modules'), lockfile: existsSync('package-lock.json') };
const permissions = [];
for (const directory of [root, path.join(root, '.npm-cache')]) {
  const probe = path.join(directory, `validation-${process.pid}.tmp`);
  try { writeFileSync(probe, 'ClickIT permission probe', { flag: 'wx' }); unlinkSync(probe); permissions.push({ directory, write: 'PASS', delete: 'PASS' }); }
  catch (e) { permissions.push({ directory, error: inspect(e, { depth: null }) }); }
}
writeFileSync(path.join(evidence, 'environment.json'), JSON.stringify({ ...config, permissions }, null, 2));
try {
  await fetch('https://registry.npmjs.org/@eslint%2fjs', { signal: AbortSignal.timeout(15000) });
  writeFileSync(path.join(evidence, 'network.log'), 'HTTPS fetch completed.');
} catch (e) { writeFileSync(path.join(evidence, 'network.log'), inspect(e, { depth: null, colors: false })); }

const logs = readdirSync('.npm-cache/_logs').filter(name => name.endsWith('-debug-0.log'));
for (const log of logs) {
  const contents = readFileSync(path.join('.npm-cache/_logs', log), 'utf8');
  if (contents.includes('verbose title npm install') && contents.includes('EACCES')) {
    copyFileSync(path.join('.npm-cache/_logs', log), path.join(evidence, 'npm-install-debug.log'));
  }
}
for (const command of ['lint', 'typecheck', 'test', 'build', 'dev', 'start', 'models']) run(command, process.execPath, [npmCli, 'run', command]);
// Package gate only; do not attempt to ship an application that has failed preceding gates.
run('verify-models', process.execPath, ['scripts/verify-models.mjs']);

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = { ...manifest.dependencies, ...manifest.devDependencies };
const imports = [];
function audit(file) {
  const source = readFileSync(file, 'utf8');
  const pattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier.startsWith('node:')) continue;
    if (specifier.startsWith('.')) { imports.push({ file, specifier, kind: 'relative', present: existsSync(path.resolve(path.dirname(file), specifier)) }); continue; }
    const dependency = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    imports.push({ file, specifier, dependency, declared: declared[dependency] ?? null, section: manifest.dependencies[dependency] ? 'dependencies' : manifest.devDependencies[dependency] ? 'devDependencies' : 'MISSING' });
  }
}
function scan(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) scan(file); else if (/\.(?:tsx?|mjs)$/.test(entry.name)) audit(file); } }
scan('src'); scan('scripts'); audit('vite.config.ts'); audit('eslint.config.mjs');
writeFileSync(path.join(evidence, 'imports.json'), JSON.stringify(imports, null, 2));
writeFileSync(path.join(evidence, 'commands.json'), JSON.stringify(results, null, 2));
console.log('Missing declarations:', imports.filter(item => item.section === 'MISSING'));
console.log('Missing local imports:', imports.filter(item => item.kind === 'relative' && !item.present));
