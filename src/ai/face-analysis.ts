import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Face } from '../types/domain.ts';
import { sharpness } from './quality.ts';
import { classifyEyes } from './eyes.ts';

// Shared production postprocessing; browser APIs, called only in the renderer.
export function facesFromResult(bitmap: ImageBitmap, result: FaceLandmarkerResult): Face[] {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponível.');
      context.drawImage(bitmap, 0, 0);
      return result.faceLandmarks.map((landmarks, index) => {
        const x = Math.max(0, Math.min(...landmarks.map(l => l.x))), y = Math.max(0, Math.min(...landmarks.map(l => l.y)));
        const width = Math.min(1 - x, Math.max(...landmarks.map(l => l.x)) - x), height = Math.min(1 - y, Math.max(...landmarks.map(l => l.y)) - y);
        const w = Math.max(1, Math.floor(width * bitmap.width)), h = Math.max(1, Math.floor(height * bitmap.height));
        const pixels = context.getImageData(Math.floor(x * bitmap.width), Math.floor(y * bitmap.height), w, h).data;
        const gray = new Uint8Array(w * h);
        for (let i = 0; i < gray.length; i++) gray[i] = Math.round(pixels[i * 4]! * 0.299 + pixels[i * 4 + 1]! * 0.587 + pixels[i * 4 + 2]! * 0.114);
        const categories = result.faceBlendshapes[index]?.categories ?? [];
        const left = categories.find(c => c.categoryName === 'eyeBlinkLeft')?.score;
        const right = categories.find(c => c.categoryName === 'eyeBlinkRight')?.score;
        const eyeResult = classifyEyes(landmarks, bitmap.width, bitmap.height);
        return { x, y, width, height, sharpness: sharpness(gray, w, h), eyes: eyeResult.eyes, eyesConfidence: eyeResult.confidence, leftEyeScore: eyeResult.leftEyeScore, rightEyeScore: eyeResult.rightEyeScore, leftEyeState: eyeResult.leftEyeState, rightEyeState: eyeResult.rightEyeState, blinkLeft: left ?? 0.5, blinkRight: right ?? 0.5 };
      });
}
