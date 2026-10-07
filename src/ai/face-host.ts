import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { facesFromResult } from './face-analysis.ts';
import { faceOptions, faceWasmUrl } from './face-options.ts';
// Runs in a dedicated hidden sandboxed Electron renderer, never on the UI thread.
const model = FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(faceWasmUrl), faceOptions);
void model.catch(() => {});
window.clickit.onFaceJob(job => {
  void (async () => {
    let bitmap: ImageBitmap | undefined;
    try {
      const landmarker = await model;
      bitmap = await createImageBitmap(await (await fetch(job.url)).blob());
      const result = landmarker.detect(bitmap);
      const faces = facesFromResult(bitmap, result);
      window.clickit.faceReply({ id: job.id, faces });
    } catch (e) { window.clickit.faceReply({ id: job.id, faces: [], error: e instanceof Error ? e.message : 'Falha facial' }); }
    finally { bitmap?.close(); }
  })();
});
window.clickit.faceReady();
