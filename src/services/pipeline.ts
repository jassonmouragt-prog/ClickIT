import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { Store } from '../database/store.ts';
import type { Face, Photo, Progress } from '../types/domain.ts';
import { exists, walk } from '../lib/files.ts';
import { ANALYSIS_VERSION } from '../lib/config.ts';
import { makeAnalysis } from '../ai/quality.ts';
import type { Candidate, RankedGroup } from '../ai/grouping.ts';
import type { Prepared } from '../workers/analysis.ts';
import { previewPaths, type Preview } from './preview.ts';
export interface PipelineOptions { store: Store; workerFile: string; groupingFile: string; cache: string; model: string | null; concurrency: number; faces: ((id: string, preview: string) => Promise<Face[]>) | null; emit: (progress: Progress) => void; log: (event: string, details: Record<string, string | number>) => void; onPrepared?: (photoId: string, result: Prepared) => void }
export class Pipeline {
  cancelled = false; active = false; private options: PipelineOptions;
  constructor(options: PipelineOptions) { this.options = options; }
  cancel(): void { this.cancelled = true; }
  async index(projectId: string): Promise<void> {
    const { store, emit } = this.options; const project = store.project(projectId);
    store.status(projectId, 'INDEXING'); let count = 0, previewFailures = 0;
    emit({ projectId, kind: 'INDEX', stage: 'Identificando fotografias', done: 0, total: 0, failed: 0, active: true });
    try {
      for await (const file of walk(project.sourcePath, () => this.cancelled)) {
        try {
          const details = await stat(file);
          store.index(projectId, { path: file, name: path.basename(file), extension: path.extname(file).toLowerCase(), size: details.size, mtime: details.mtimeMs });
          count++;
          if (count % 25 === 0) emit({ projectId, kind: 'INDEX', stage: 'Identificando fotografias', done: count, total: 0, failed: 0, active: true });
        } catch (error) { this.options.log('index-file-error', { projectId, sourcePath: file, error: error instanceof Error ? error.stack ?? error.message : String(error) }); }
      }
      if (!this.cancelled) previewFailures = await this.previews(projectId);
      store.status(projectId, this.cancelled ? 'INTERRUPTED' : 'NEW');
    } catch (e) { store.status(projectId, 'INTERRUPTED'); throw e; }
    finally { emit({ projectId, kind: 'INDEX', stage: this.cancelled ? 'Indexação interrompida' : 'Pasta indexada', done: count, total: count, failed: previewFailures, active: false }); }
  }
  async previews(projectId: string): Promise<number> {
    const { store, cache, emit, log } = this.options;
    const pending: Photo[] = [];
    for (const photo of store.photos(projectId)) {
      if (!await exists(photo.previewPath) || !await exists(photo.thumbnailPath)) {
        pending.push(photo);
        log('PREVIEW_QUEUED', { id: photo.id, sourcePath: photo.originalPath, ...previewPaths(photo, cache), error: '' });
      }
    }
    let done = 0, failed = 0, next = 0;
    const progress = (active: boolean): void => emit({ projectId, kind: 'PREVIEW', stage: this.cancelled ? 'Previews interrompidos' : 'Gerando previews', done, total: pending.length, failed, active });
    if (!pending.length) return 0;
    progress(true);
    const loop = async (): Promise<void> => {
      while (!this.cancelled) {
        const photo = pending[next++]; if (!photo) break;
        const details = { id: photo.id, sourcePath: photo.originalPath, ...previewPaths(photo, cache), error: '' };
        // A failed decoder cannot poison the next image's worker.
        let activeWorker: Worker | undefined;
        try {
          const worker = activeWorker = new Worker(path.join(path.dirname(this.options.workerFile), 'preview.cjs'), { workerData: { cache } });
          log('PREVIEW_STARTED', details);
          const result = await new Promise<Preview>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Tempo limite ao gerar preview.')), 120000);
            const finish = (): void => { clearTimeout(timer); };
            worker.once('message', (reply: { result?: Preview; error?: string }) => { finish(); if (reply.result) resolve(reply.result); else reject(new Error(reply.error ?? 'Falha no preview')); });
            worker.once('error', error => { finish(); reject(error); });
            worker.once('exit', code => { finish(); reject(new Error(`Worker de preview encerrado (${code})`)); });
            worker.postMessage(photo);
          });
          if (!await exists(result.previewPath) || !await exists(result.thumbnailPath)) throw new Error('Worker não gravou os arquivos de preview.');
          log('PREVIEW_WRITTEN', { ...details, ...result });
          const current = await stat(photo.originalPath);
          if (current.size !== photo.fileSize || current.mtimeMs !== photo.mtime) throw new Error('Arquivo mudou durante a geração de preview. Reindexe a pasta.');
          store.preview(photo.id, result);
          log('PREVIEW_DB_SAVED', details);
        } catch (error) {
          failed++;
          const message = error instanceof Error ? error.stack ?? error.message : String(error);
          store.previewFailed(photo.id, message);
          log('PREVIEW_FAILED', { ...details, error: message });
        } finally {
          const worker = activeWorker;
          if (worker) await new Promise<void>(resolve => {
            const timer = setTimeout(() => { void worker.terminate().finally(resolve); }, 5000);
            worker.once('exit', () => { clearTimeout(timer); resolve(); });
            if (worker.threadId === -1) { clearTimeout(timer); resolve(); } else worker.postMessage('CLOSE');
          });
        }
        done++; progress(true);
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(this.options.concurrency, pending.length) }, loop)); }
    finally { progress(false); }
    return failed;
  }
  async analyze(projectId: string): Promise<void> {
    const { store, emit, cache, model, faces, workerFile, concurrency } = this.options;
    const all = store.photos(projectId), pending: Photo[] = [];
    for (const p of all) {
      if (p.analysisStatus !== 'DONE' || p.analysis?.version !== ANALYSIS_VERSION || (model && !p.analysis.embeddingAvailable) || (faces && !p.analysis.facesAvailable) || !await exists(p.previewPath) || !await exists(p.thumbnailPath)) pending.push(p);
    }
    let done = all.length - pending.length, failed = 0, next = 0;
    store.status(projectId, 'ANALYZING');
    const progress = (stage: string, active = true): void => emit({ projectId, kind: 'ANALYSIS', stage, done, total: all.length, failed, active });
    progress('Preparando fotografias');
    // Serialize calls to the facial renderer; image/embedding workers remain bounded and concurrent.
    let faceQueue: Promise<unknown> = Promise.resolve();
    const loop = async (): Promise<void> => {
      const worker = new Worker(workerFile, { workerData: { cache, model } });
      let workerStopped = false;
      worker.on('exit', () => { workerStopped = true; });
      worker.on('error', () => { workerStopped = true; });
      try {
        while (!this.cancelled) {
          const photo = pending[next++]; if (!photo) break;
          try {
            if (workerStopped) throw new Error('Worker indisponível. Reinicie a análise.');
            progress('Gerando previews · analisando nitidez e similaridade');
            const result = await new Promise<Prepared>((resolve, reject) => {
              const timeout = setTimeout(() => { error(new Error('Tempo limite ao ler a fotografia.')); void worker.terminate(); }, 120000);
              const cleanup = (): void => { clearTimeout(timeout); worker.off('message', message); worker.off('error', error); worker.off('exit', exit); };
              const message = (reply: { result?: Prepared; error?: string }): void => { cleanup(); if (reply.result) resolve(reply.result); else reject(new Error(reply.error ?? 'Falha no worker')); };
              const error = (e: Error): void => { cleanup(); reject(e); };
              const exit = (): void => error(new Error('Worker encerrado inesperadamente.'));
              worker.once('message', message); worker.once('error', error); worker.once('exit', exit); worker.postMessage(photo);
            });
            // Diagnostic observer preserves completed native work if the facial stage fails.
            this.options.onPrepared?.(photo.id, result);
            if (this.cancelled) break;
            let detected: Face[] = [];
            if (faces) {
              progress('Analisando rostos e olhos');
              const facial = faceQueue.then(() => faces(photo.id, result.previewPath));
              faceQueue = facial.catch(() => {}); detected = await facial;
            }
            const current = await stat(photo.originalPath);
            if (current.size !== photo.fileSize || current.mtimeMs !== photo.mtime) throw new Error('Arquivo mudou durante a análise. Reindexe a pasta.');
            store.result(photo.id, { ...result, analysis: makeAnalysis(result.global, result.regional, result.light, detected, !!faces, !!result.embedding) });
          } catch (e) { failed++; store.failed(photo.id, e instanceof Error ? e.message : 'Erro de leitura'); this.options.log('analysis-file-error', { photoId: photo.id }); }
          done++; progress('Analisando fotografias');
        }
      } finally {
        if (!workerStopped) await new Promise<void>(resolve => {
          const timeout = setTimeout(() => { void worker.terminate().finally(resolve); }, 5000);
          worker.once('exit', () => { clearTimeout(timeout); resolve(); }); worker.postMessage('CLOSE');
        });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, loop));
      if (!this.cancelled) {
        progress('Comparando imagens · criando seleção');
        const candidates = store.candidates(projectId);
        const groupingWorker = new Worker(this.options.groupingFile, { workerData: candidates });
        const result = await new Promise<{ groups: RankedGroup[]; candidates: Candidate[] }>((resolve, reject) => {
          groupingWorker.once('message', resolve); groupingWorker.once('error', reject);
          groupingWorker.once('exit', code => { if (code !== 0) reject(new Error('Falha ao agrupar fotografias.')); });
        });
        if (!this.cancelled) store.saveGroups(projectId, result.groups, result.candidates);
      }
      store.status(projectId, this.cancelled ? 'INTERRUPTED' : 'READY');
    } catch (e) { store.status(projectId, 'INTERRUPTED'); throw e; }
    finally { progress(this.cancelled ? 'Análise interrompida · resultados preservados' : 'Análise concluída', false); }
  }
}
