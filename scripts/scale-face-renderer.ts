import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { faceOptions, faceWasmUrl } from '../src/ai/face-options.ts';
import { facesFromResult } from '../src/ai/face-analysis.ts';

let model: FaceLandmarker | undefined;
export async function initialize() {
  const fileset = await FilesetResolver.forVisionTasks(faceWasmUrl);
  model = await FaceLandmarker.createFromOptions(fileset, faceOptions);
}
export async function detect(id: string) {
  if (!model) throw new Error('Modelo facial não inicializado');
  const response = await fetch('clickit://photo/input');
  if (!response.ok) throw new Error(`Preview HTTP ${response.status}`);
  const image = await createImageBitmap(await response.blob());
  try {
    console.log('SCALE_RENDERER=' + JSON.stringify({ event: 'inference-started', id }));
    const start = performance.now();
    const result = model.detect(image);
    const detectionMs = performance.now() - start;
    console.log('SCALE_RENDERER=' + JSON.stringify({ event: 'inference-completed', id, detectionMs }));
    const metricsStart = performance.now();
    const faces = facesFromResult(image, result);
    return { faces, detectionMs, eyesAndFaceMetricsMs: performance.now() - metricsStart };
  } finally { image.close(); }
}
export function close() { model?.close(); model = undefined; }
