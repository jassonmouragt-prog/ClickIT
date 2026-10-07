import { faceOptions, faceWasmUrl } from '../src/ai/face-options.ts';
import { facesFromResult } from '../src/ai/face-analysis.ts';

const stage = (name: string) => console.log('CLICKIT_FACE_STAGE=' + JSON.stringify({ name, timestamp: new Date().toISOString() }));

export async function run(analyzeFaces = false) {
  const initializationStart = performance.now();
  stage('import-mediapipe');
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  stage('resolve-wasm');
  const wasmUrl = new URL(faceWasmUrl).href;
  stage('create-fileset-resolver');
  const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
  console.log(`WASM fileset: ${JSON.stringify(fileset)}`);
  stage('read-face-model');
  const modelResponse = await fetch(faceOptions.baseOptions!.modelAssetPath!);
  if (!modelResponse.ok) throw new Error(`Modelo: HTTP ${modelResponse.status}`);
  const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
  if (!modelBytes.length) throw new Error('Modelo vazio.');
  stage('create-face-landmarker');
  const model = await FaceLandmarker.createFromOptions(fileset, { ...faceOptions, baseOptions: { ...faceOptions.baseOptions, modelAssetPath: undefined, modelAssetBuffer: modelBytes } });
  const initializationMs = performance.now() - initializationStart;
  let image: ImageBitmap | undefined;
  try {
    stage('read-photo');
    const response = await fetch('clickit://photo/input');
    if (!response.ok) throw new Error(`Fotografia: HTTP ${response.status}`);
    const blob = await response.blob();
    stage('convert-image');
    image = await createImageBitmap(blob);
    stage('detect');
    const start = performance.now();
    const result = model.detect(image);
    const elapsedMs = performance.now() - start;
    stage('detect-returned');
    if (result.faceLandmarks.some(face => face.length !== 478 || face.some(point => ![point.x, point.y, point.z].every(Number.isFinite)))) throw new Error('Landmarks inválidos.');
    if (analyzeFaces) {
      stage('production-face-metrics');
      const metricsStart = performance.now();
      const productionFaces = facesFromResult(image, result);
      return { productionFaces, faceLandmarks: result.faceLandmarks, facesDetected: result.faceLandmarks.length, landmarkCounts: result.faceLandmarks.map(face => face.length), initializationMs, elapsedMs, faceMetricsMs: performance.now() - metricsStart, width: image.width, height: image.height, runtime: 'Electron renderer sandbox / MediaPipe CPU / production face-analysis.ts' };
    }
    // Isolated face:test does not classify eyes.
    return { facesDetected: result.faceLandmarks.length, landmarkCounts: result.faceLandmarks.map(face => face.length), firstLandmarks: result.faceLandmarks.map(face => face.slice(0, 3)), faceLandmarks: result.faceLandmarks, initializationMs, elapsedMs, width: image.width, height: image.height, faceConfidence: null, confidenceNote: 'FaceLandmarkerResult não expõe confiança de detecção/presença por rosto; thresholds configurados não são scores medidos.', eyeClassificationValidated: false, runtime: '@mediapipe/tasks-vision 0.10.35 / Electron renderer sandbox / CPU' };
  } finally { stage('close-landmarker'); image?.close(); model.close(); }
}
