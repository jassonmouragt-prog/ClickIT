import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const evidencePath = process.argv[2] ?? 'docs/evidence/focus-saturation-2026-10-06T12-51-03-650Z.json';
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const fixture = JSON.parse(await readFile('scripts/selection-expectations.json', 'utf8'));
const original = JSON.parse(await readFile('docs/evidence/selection-test-2026-10-06T12-22-27-400Z.json', 'utf8'));
const rows = [];
for (const photo of evidence.rows) {
  const image = original.images.find(candidate => candidate.id === photo.id);
  if (!image) throw new Error(`Imagem ausente no registro de origem: ${photo.id}`);
  const metadata = await sharp(image.path).metadata();
  const faceMeasurement = image.analysis.faces[0] ?? null;
  const recognized = fixture.images.find(item => item.sha256 === photo.sha256);
  const faceRect = faceMeasurement ? {
    normalized: { left: faceMeasurement.x, top: faceMeasurement.y, width: faceMeasurement.width, height: faceMeasurement.height,
      right: faceMeasurement.x + faceMeasurement.width, bottom: faceMeasurement.y + faceMeasurement.height,
      centerX: faceMeasurement.x + faceMeasurement.width / 2, centerY: faceMeasurement.y + faceMeasurement.height / 2 },
    clearance: { left: faceMeasurement.x, top: faceMeasurement.y, right: 1 - faceMeasurement.x - faceMeasurement.width, bottom: 1 - faceMeasurement.y - faceMeasurement.height }
  } : null;
  rows.push({ id: photo.id, fileName: photo.fileName, sha256: photo.sha256, role: recognized?.role ?? 'unlabelled', rank: photo.after.rank,
    technicalScore: photo.after.overall, aestheticScore: null, compositionScore: null, expressionScore: null,
    availableCompositionMeasurements: faceRect ? { faceRect, centerDistanceToNearestThird: Math.min(Math.abs(faceRect.normalized.centerX - 1/3), Math.abs(faceRect.normalized.centerX - 2/3)), note: 'Raw normalized face geometry. No validated mapping from these geometric features to composition quality.' } : null,
    availableExpressionMeasurements: faceMeasurement ? { eyes: faceMeasurement.eyes, leftEAR: faceMeasurement.leftEyeScore, rightEAR: faceMeasurement.rightEyeScore, blinkLeftBlendshape: faceMeasurement.blinkLeft, blinkRightBlendshape: faceMeasurement.blinkRight, note: 'Real saved FaceLandmarker/EAR observations. No gaze, mouth, smile or head-pose values are present in the saved production Face record.' } : null,
    image: metadata ? { width: metadata.width, height: metadata.height } : null });
}
const report = { generatedAt: new Date().toISOString(), source: evidencePath, sourceSha256: createHash('sha256').update(await readFile(evidencePath)).digest('hex'), rows,
  audit: { aestheticModel: 'not executed', aestheticScore: 'null; model artifact unavailable in this execution environment', compositionScore: 'null; geometry is reported as raw measurement, not a validated quality score', expressionScore: 'null; eyes/blink alone do not define a reliable general expression score', productionRankingChanged: false, groupingChanged: false },
  blocker: 'Shell access to Hugging Face is unavailable; Chrome blocks the Xet artifact CDN with ERR_BLOCKED_BY_CLIENT. The ONNX file is not installed or hash-verified; no model inference is claimed.' };
const target=`docs/evidence/preference-signals-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
await writeFile(target,JSON.stringify(report,null,2),{flag:'wx'});
console.table(rows.map(row=>({photo:row.fileName,technical:row.technicalScore,aesthetic:row.aestheticScore,composition:row.compositionScore,expression:row.expressionScore,eyes:row.availableExpressionMeasurements?.eyes,centerX:row.availableCompositionMeasurements?.faceRect.normalized.centerX,headroom:row.availableCompositionMeasurements?.faceRect.clearance.top})));
console.log('Model inference: NOT RUN. Evidence:',target);
