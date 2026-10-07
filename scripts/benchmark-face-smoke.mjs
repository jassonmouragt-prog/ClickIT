import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LIMITS } from '../src/lib/config.ts';
import { faceService } from './scale-face-client.mjs';
import { root, json, filesIn, args, productionFingerprint, harnessFingerprint } from './scale-common.mjs';

const options = args(process.argv.slice(2), ['--dir']);
const source = path.resolve(options['--dir'] ?? path.join(root, '.test-tmp/scale-data-100'));
await mkdir(path.join(root, '.test-tmp'), { recursive: true });
const workspace = await mkdtemp(path.join(root, '.test-tmp/face-smoke-'));
const previews = path.join(workspace, 'previews'); await mkdir(previews);
const report = { reportVersion: 2, workspace, source, count: 3, status: 'BLOCKED', results: [], error: null, productionFingerprint: await productionFingerprint(), harnessFingerprint: await harnessFingerprint() };
let service;
try {
  const files = (await filesIn(source)).filter(f => /\.(png|jpe?g)$/i.test(f)).slice(0, 3);
  if (files.length !== 3) throw new Error('Smoke exige 3 imagens existentes');
  for (const [i, file] of files.entries()) await sharp(file, { limitInputPixels: 150_000_000 }).rotate().resize(LIMITS.preview, LIMITS.preview, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(path.join(previews, `${i}.jpg`));
  service = await faceService(path.join(workspace, 'host'), previews, { onDiagnostics: value => { report.host = value; } });
  for (let i = 0; i < 3; i++) report.results.push(await service.detect(path.join(previews, `${i}.jpg`)));
  await service.close();
  const h = report.host;
  report.status = h.starts === 1 && h.requests === 3 && h.responses === 3 && h.successfulResponses === 3 && JSON.stringify(h.requestIds) === JSON.stringify(h.responseIds) && h.shutdownAcknowledged && h.outcome.exitCode === 0 && !h.outcome.unexpectedExit && !h.outcome.nativeCrash && h.events.filter(e => e.event === 'host:model-loaded').length === 1 ? 'PASS' : 'FAIL';
} catch (error) { report.error = error.stack ?? String(error); report.status = service ? 'FAIL' : 'BLOCKED'; }
finally {
  if (service) try { await service.close(); } catch (error) { report.error ??= String(error); report.status = 'FAIL'; }
  report.host ??= service?.diagnostics ?? null;
  await json(path.join(workspace, 'report.json'), report);
  await json(path.join(root, 'docs/evidence/scale-face-smoke.json'), report);
}
console.log(JSON.stringify({ status: report.status, images: report.results.length, starts: report.host?.starts, requests: report.host?.requests, responses: report.host?.responses, outcome: report.host?.outcome, error: report.error, workspace }, null, 2));
process.exitCode = report.status === 'PASS' ? 0 : 1;
