import type { FaceLandmarkerOptions } from '@mediapipe/tasks-vision';
export const faceWasmUrl = 'clickit://app/wasm';
export const faceOptions: FaceLandmarkerOptions = {
  baseOptions: { modelAssetPath: 'clickit://models/face_landmarker.task', delegate: 'CPU' },
  runningMode: 'IMAGE', numFaces: 20, outputFaceBlendshapes: true,
  minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6
};
