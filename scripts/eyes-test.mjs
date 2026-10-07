import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faceProbe } from './face-probe.mjs';
import { root } from './models.mjs';
import { classifyEyes } from '../src/ai/eyes.ts';
import { EYES } from '../src/ai/eyes-config.ts';

export function parseEyesArgs(args) {
  const options = {};
  if (args.length !== 4) throw new Error('Informe --photo e --expected explicitamente.');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--photo', '--expected'].includes(key) || key in options || !value || value.startsWith('--')) throw new Error('Argumento ausente, duplicado ou desconhecido.');
    options[key] = value;
  }
  if (!options['--photo'] || !['OPEN', 'CLOSED', 'UNCERTAIN'].includes(options['--expected'])) throw new Error('--expected deve ser OPEN, CLOSED ou UNCERTAIN.');
  return { photo: path.resolve(options['--photo']), expected: options['--expected'] };
}

export function allEyesMatch(faces, facesDetected, expected) {
  return ['OPEN', 'CLOSED', 'UNCERTAIN'].includes(expected) && Number.isInteger(facesDetected) && facesDetected > 0 && faces.length === facesDetected && faces.every(face =>
    face.leftEyeState === expected && face.rightEyeState === expected &&
    [face.leftEyeScore, face.rightEyeScore].every(score => (expected === 'UNCERTAIN' && score === null) || (typeof score === 'number' && Number.isFinite(score) && score >= 0)));
}

async function main() {
  let options;
  try { options = parseEyesArgs(process.argv.slice(2)); }
  catch (error) { console.error(`${error.message}\nUso: npm run eyes:test -- --photo "foto.png" --expected OPEN|CLOSED|UNCERTAIN`); process.exitCode = 2; return; }
  const { photo, expected } = options;
  const report = { generatedAt: new Date().toISOString(), photo, expected, config: EYES, scoreMeaning: 'EAR geométrico: razão de abertura/ largura, não probabilidade.', confidenceMeaning: 'Margem heurística normalizada até o limiar, não calibrada; não é confidence do MediaPipe.', ok: false };
  const start = performance.now();
  try {
    report.photoSha256 = createHash('sha256').update(await readFile(photo)).digest('hex');
    const detected = await faceProbe(photo, true);
    const eyeStart = performance.now();
    if (!detected.faceLandmarks?.length) throw new Error('Sem landmarks completos reais; não é possível avaliar olhos.');
    report.faces = detected.faceLandmarks.map(landmarks => classifyEyes(landmarks, detected.width, detected.height));
    report.eyesMs = performance.now() - eyeStart;
    report.initializationMs = detected.initializationMs;
    report.faceInferenceMs = detected.elapsedMs;
    report.facesDetected = detected.facesDetected;
    report.landmarkCounts = detected.landmarkCounts;
    report.runtime = detected.runtime;
    report.imageSize = { width: detected.width, height: detected.height };
    report.totalMs = performance.now() - start;
    report.ok = allEyesMatch(report.faces, detected.facesDetected, expected);
    if (!report.ok) throw new Error(`Classificação medida não corresponde a ${expected} nos dois olhos de todos os rostos.`);
    console.log(`PASS: ambos os olhos ${expected}; isso valida somente esta fotografia, não calibração geral.`);
  } catch (error) { report.error = error.stack ?? String(error); process.exitCode = 1; console.error(`FAIL: ${report.error}`); }
  finally {
    report.totalMs = performance.now() - start;
    const photoLabel = path.parse(photo).name.replace(/[^a-zA-Z0-9_-]/g, '-');
    const evidence = path.join(root, `docs/evidence/eyes-test-${photoLabel}-${expected.toLowerCase()}-${randomUUID()}.json`);
    report.evidenceFile = evidence;
    await writeFile(evidence, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
    console.log(`Evidência: ${evidence}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
