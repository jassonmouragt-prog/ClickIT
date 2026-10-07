// Restricted validation ladder: cold-only 10, then cold-only 100. Never launches 500/1000.
import { mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execute, clean } from './benchmark-scale.mjs';
import { args, root, readJson, json, sha256, harnessFingerprint, productionFingerprint } from './scale-common.mjs';

const options = args(process.argv.slice(2), ['--count', '--dir']);
const count = Number(options['--count']);
if (![10, 100].includes(count)) throw new Error('--count aceita apenas 10 ou 100 nesta validação');
const report = { count, scope: 'Harness validation only; cold pipeline, no full scale acceptance or leak conclusion', status: 'NOT_RUN', counters: null, run: null };
try {
  report.harnessFingerprint = await harnessFingerprint(); report.productionFingerprint = await productionFingerprint();
  const gate = await readJson(path.join(root, 'docs/evidence', count === 10 ? 'scale-face-smoke.json' : 'scale-harness-10.json'));
  if (gate.status !== 'PASS' || JSON.stringify(gate.harnessFingerprint) !== JSON.stringify(report.harnessFingerprint) || JSON.stringify(gate.productionFingerprint) !== JSON.stringify(report.productionFingerprint)) throw new Error('Etapa anterior precisa PASS na mesma versão do harness/produção');
  const source = path.resolve(options['--dir'] ?? path.join(root, '.test-tmp/scale-data-100'));
  const manifest = await readJson(path.join(source, 'dataset-scale-manifest.json'));
  if (manifest.entries.length < count) throw new Error('Dataset insuficiente');
  await mkdir(path.join(root, '.test-tmp'), { recursive: true });
  const workspace = await mkdtemp(path.join(root, `.test-tmp/harness-${count}-`));
  const input = path.join(workspace, 'input'); await mkdir(input);
  for (const entry of manifest.entries.slice(0, count)) {
    if (path.basename(entry.file) !== entry.file || await sha256(path.join(source, entry.file)) !== entry.sha256) throw new Error('Arquivo não corresponde ao manifesto');
    await copyFile(path.join(source, entry.file), path.join(input, entry.file));
  }
  report.workspace = workspace;
  report.run = await execute(input, path.join(workspace, 'run'), `harness-${count}`, Math.min(4 * 1024 ** 3, Math.floor(os.totalmem() * 0.7)));
  report.counters = report.run.counters;
  const host = report.run.faceHost;
  report.status = clean(report.run) && report.counters.done === count && report.counters.failed === 0 && host?.starts === 1 && host.requests === count && host.successfulResponses === count && host.responses === count && host.unexpectedExits === 0 && host.shutdownAcknowledged && host.outcome?.exitCode === 0 && report.run.memory.phases['steady-state'].validSamples > 0 && report.run.memory.phases['steady-state'].validSamples === report.run.memory.phases['steady-state'].samples ? 'PASS' : report.run.status === 'BLOCKED' ? 'BLOCKED' : 'FAIL';
} catch (error) { report.error = error.stack ?? String(error); }
await json(path.join(root, `docs/evidence/scale-harness-${count}.json`), report);
console.log(JSON.stringify({ count, status: report.status, counters: report.counters, error: report.error, hostStarts: report.run?.faceHost?.starts, requests: report.run?.faceHost?.requests, responses: report.run?.faceHost?.responses, unexpectedExits: report.run?.faceHost?.unexpectedExits, totalMs: report.run?.totalMs }, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;
