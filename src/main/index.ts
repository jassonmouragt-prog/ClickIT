import { app, BrowserWindow, dialog, ipcMain, net, protocol, session } from 'electron';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { mkdirSync } from 'node:fs';
import { exists, inside } from '../lib/files.ts';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Store } from '../database/store.ts';
import { Pipeline } from '../services/pipeline.ts';
import { Logger } from '../services/log.ts';
import { exportPhotos, selected } from '../services/export.ts';
import * as validate from '../lib/validation.ts';
import type { Face, FaceReply, Progress, Settings } from '../types/domain.ts';
import { LIMITS } from '../lib/config.ts';
import { LICENSED } from '../licensing/types.ts';
import type { LicenseManager } from '../licensing/manager.ts';
import { installLicenseManager, licenseApiUrl } from './license.ts';
protocol.registerSchemesAsPrivileged([{ scheme: 'clickit', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
let win: BrowserWindow | null = null, faceWindow: BrowserWindow | null = null;
let store: Store, logger: Logger, pipeline: Pipeline | null = null;
let license: LicenseManager;
let busy = false, exporting = false, cancelExport = false, currentProgress: Progress | null = null;
const pendingFaces = new Map<string, { resolve: (f: Face[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const temporaryAssets = new Map<string, string>();
let facesReady: (() => void) | null = null;
const models = (): string => app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(app.getAppPath(), 'resources/models');
const storage = (): string => path.join(app.getPath('userData'), 'storage');
function emit(progress: Progress): void { currentProgress = progress; win?.webContents.send('progress', progress); }
function workers(settings: Settings): number {
  const safe = Math.max(1, Math.min(LIMITS.maxWorkers, Math.floor(availableParallelism() / 2), Math.floor(totalmem() / 1024 ** 3 / 2)));
  return settings.mode === 'ECO' ? 1 : settings.mode === 'AUTO' ? Math.min(2, safe) : Math.min(settings.concurrency, safe);
}
async function faceService(): Promise<(id: string, preview: string) => Promise<Face[]>> {
  if (!faceWindow) {
    faceWindow = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    secure(faceWindow);
    faceWindow.on('closed', () => { faceWindow = null; for (const pending of pendingFaces.values()) { clearTimeout(pending.timer); pending.reject(new Error('Serviço facial encerrado.')); } pendingFaces.clear(); });
    const ready = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Serviço facial não iniciou.')), LIMITS.faceTimeout); facesReady = () => { clearTimeout(timer); resolve(); }; });
    await faceWindow.loadURL('clickit://app/faces.html'); await ready;
  }
  return (id, preview) => new Promise((resolve, reject) => {
    temporaryAssets.set(id, preview);
    const timer = setTimeout(() => { pendingFaces.delete(id); temporaryAssets.delete(id); reject(new Error('Tempo limite na análise facial.')); }, LIMITS.faceTimeout);
    pendingFaces.set(id, { resolve, reject, timer }); faceWindow!.webContents.send('face:job', { id, url: `clickit://photo/${id}/working` });
  });
}
function secure(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
async function operation(action: () => Promise<void>): Promise<void> {
  if (busy) throw new Error('Aguarde ou cancele a operação atual.');
  busy = true;
  try { await action(); } catch (e) {
    logger.write('operation-error', { error: e instanceof Error ? e.stack ?? e.message : String(e) });
    if (currentProgress) emit({ ...currentProgress, active: false, error: e instanceof Error ? e.message : 'Falha na operação' });
    throw e;
  } finally { busy = false; pipeline = null; }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.restore(); win?.focus(); });
  void app.whenReady().then(async () => {
    mkdirSync(storage(), { recursive: true });
    store = new Store(path.join(storage(), 'clickit.sqlite'));
    logger = new Logger(path.join(storage(), 'logs'), app.getVersion()); logger.write('startup');
    license = await installLicenseManager();
    session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    // No runtime internet, except the licensing server (activation/revalidation only).
    const licenseOrigin = new URL(licenseApiUrl()).origin;
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      if (details.url.startsWith(licenseOrigin)) callback({});
      else callback({ cancel: true });
    });
    protocol.handle('clickit', async request => {
      try {
        const url = new URL(request.url); let file: string | null = null;
        if (url.hostname === 'app') {
          const root = path.join(__dirname, 'renderer'); file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
          if (!inside(root, file)) return new Response('Forbidden', { status: 403 });
        } else if (url.hostname === 'models' && url.pathname === '/face_landmarker.task') file = path.join(models(), 'face_landmarker.task');
        else if (url.hostname === 'photo') {
          const [, photoId, kind] = url.pathname.split('/'); validate.id(photoId);
          if (kind === 'working') file = temporaryAssets.get(photoId!) ?? null;
          else if (kind === 'thumbnail' || kind === 'preview' || kind === 'original') file = store.asset(photoId!, kind);
        }
        if (!file || !await exists(file)) {
          logger.write('ASSET_FAILED', { url: request.url, previewPath: file ?? '', error: 'Arquivo nao encontrado', status: 404 });
          return new Response('Not found', { status: 404 });
        }
        return await net.fetch(pathToFileURL(file).toString());
      } catch (error) {
        logger.write('ASSET_FAILED', { url: request.url, error: error instanceof Error ? error.stack ?? error.message : String(error) });
        return new Response('Invalid request', { status: 400 });
      }
    });
    win = new BrowserWindow({ width: 1480, height: 960, minWidth: 1000, minHeight: 680, backgroundColor: '#0B0F17', title: 'ClickIT', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    secure(win);
    win.webContents.on('render-process-gone', (_event, details) => logger.write('RENDER_PROCESS_GONE', { ...details }));
    win.webContents.on('unresponsive', () => logger.write('RENDERER_UNRESPONSIVE'));
    win.webContents.on('did-start-loading', () => logger.write('RENDERER_LOADING'));
    win.webContents.on('did-finish-load', () => logger.write('RENDERER_LOADED'));
    win.webContents.on('did-fail-load', (_event, code, description, url) => logger.write('RENDERER_LOAD_FAILED', { code, error: description, url }));
    ipcMain.on('diagnostic', (event, name: unknown, details: unknown) => {
      if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) return;
      if (typeof name !== 'string' || !/^(PREVIEW_RENDERED|PREVIEW_FAILED|WINDOW_ERROR|UNHANDLED_REJECTION|CONSOLE_ERROR|REACT_ERROR_BOUNDARY)$/.test(name)) return;
      try {
        const data = validate.record(details);
        if (Object.values(data).some(value => typeof value !== 'string' && typeof value !== 'number')) return;
        logger.write(name, data as Record<string, string | number>);
      } catch (error) { logger.write('DIAGNOSTIC_ERROR', { error: String(error) }); }
    });
const handle = (channel: string, fn: (...args: unknown[]) => unknown, protectedChannel = false): void => {
      ipcMain.handle(channel, async (event, ...args: unknown[]) => {
        try {
          const mainWindow = win;
          if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame?.url !== 'clickit://app/index.html') throw new Error('Origem IPC inválida.');
          if (protectedChannel) {
            const status = await license.status();
            if (!LICENSED.has(status.state)) throw new Error(status.message ?? 'Licença pendente.');
          }
          return await fn(...args);
        } catch (error) { logger.write('IPC_ERROR', { channel, error: error instanceof Error ? error.stack ?? error.message : String(error) }); throw error; }
      });
    };
    handle('license:status', () => license.status());
    handle('license:activate', value => { if (typeof value !== 'string') throw new Error('Chave inválida.'); return license.activate(value); });
    handle('license:deactivate', () => license.deactivate());
    const owner = (channel: string, fn: (...args: unknown[]) => unknown): void => handle(channel, fn, true);
    owner('projects:list', () => store.projects());
    owner('projects:create', async value => {
      if (busy) throw new Error('Aguarde a operação atual.');
      const name = validate.name(value), folder = await dialog.showOpenDialog(win!, { title: 'Selecionar pasta de fotografias', properties: ['openDirectory'] });
      return folder.canceled || !folder.filePaths[0] ? null : store.create(name, folder.filePaths[0]);
    });
    owner('photos:list', value => {
      const photos = store.photos(validate.id(value));
      for (const photo of photos) if (photo.previewPath && photo.thumbnailPath) logger.write('PREVIEW_URL_CREATED', { id: photo.id, sourcePath: photo.originalPath, previewPath: photo.previewPath, thumbnailPath: photo.thumbnailPath, url: `clickit://photo/${photo.id}/preview?v=${photo.mtime}`, thumbnailUrl: `clickit://photo/${photo.id}/thumbnail?v=${photo.mtime}`, error: '' });
      return photos;
    });
    owner('photos:decide', (value, patch) => store.decide(validate.id(value), validate.decision(patch)));
    handle('progress:get', () => currentProgress);
    handle('settings', value => value === undefined ? store.settings() : store.settings(validate.settings(value)));
    handle('system', async () => {
      const gpu = await app.getGPUInfo('basic').catch(() => ({}));
      return { cpu: cpus()[0]?.model ?? 'CPU', cores: availableParallelism(), ramGB: Math.round(totalmem() / 1024 ** 3), gpu: JSON.stringify(gpu), recommendedWorkers: workers({ mode: 'AUTO', concurrency: 1 }), embeddingModel: await exists(path.join(models(), 'dinov2-small.onnx')), faceModel: await exists(path.join(models(), 'face_landmarker.task')), version: app.getVersion() };
    });
    const options = () => ({ store, workerFile: path.join(__dirname, 'analysis.cjs'), groupingFile: path.join(__dirname, 'grouping.cjs'), cache: path.join(storage(), 'cache'), model: null, faces: null, concurrency: workers(store.settings()), emit, log: (event: string, data: Record<string, string | number>) => logger.write(event, data) });
    owner('projects:index', async value => {
      const id = validate.id(value);
      await operation(async () => { pipeline = new Pipeline(options()); await pipeline.index(id); });
    });
    owner('projects:analyze', async value => {
      const id = validate.id(value); store.project(id);
      await operation(async () => {
        const model = path.join(models(), 'dinov2-small.onnx');
        if (!await exists(model) || !await exists(path.join(models(), 'face_landmarker.task'))) throw new Error('Modelos locais ausentes. Conclua a instalação dos modelos da ClickIT antes de analisar.');
        const faces = await faceService();
        pipeline = new Pipeline({ ...options(), model, faces }); await pipeline.analyze(id);
      });
    });
    owner('cancel', () => { pipeline?.cancel(); cancelExport = true; });
    owner('export', async (value, mode) => {
      const id = validate.id(value); if (mode !== 'COPY' && mode !== 'LIST') throw new Error('Formato inválido.');
      if (busy) throw new Error('Aguarde a operação atual.');
      const photos = selected(store.photos(id));
      const folder = await dialog.showOpenDialog(win!, { title: 'Exportar seleção para', properties: ['openDirectory', 'createDirectory'] });
      const destination = folder.filePaths[0];
      if (folder.canceled || !destination) return { copied: 0, total: photos.length, cancelled: true, destination: null, errors: [] };
      if (inside(destination, store.project(id).sourcePath)) throw new Error('Escolha uma subpasta ou uma pasta que não contenha a origem para a exportação.');
      busy = true; exporting = true; cancelExport = false;
      try {
        emit({ projectId: id, kind: 'EXPORT', stage: 'Exportando originais', done: 0, total: photos.length, failed: 0, active: true });
        const result = await exportPhotos(photos, destination, mode, () => cancelExport, (done, total) => emit({ projectId: id, kind: 'EXPORT', stage: 'Exportando originais', done, total, failed: 0, active: true }));
        emit({ projectId: id, kind: 'EXPORT', stage: result.cancelled ? 'Exportação cancelada' : 'Exportação concluída', done: result.copied, total: result.total, failed: result.errors.length, active: false }); return result;
      } finally { busy = false; exporting = false; if (currentProgress?.active) emit({ ...currentProgress, active: false, stage: 'Exportação interrompida' }); }
    });
    ipcMain.on('face:ready', event => { if (event.sender === faceWindow?.webContents) { facesReady?.(); facesReady = null; } });
    ipcMain.on('face:reply', (event, value: unknown) => {
      if (event.sender !== faceWindow?.webContents) return;
      try {
        const reply = validate.record(value) as unknown as FaceReply;
        validate.id(reply.id); const pending = pendingFaces.get(reply.id); if (!pending) return;
        if (!Array.isArray(reply.faces) || reply.faces.length > 20 || reply.faces.some(f => ![f.x, f.y, f.width, f.height, f.sharpness, f.blinkLeft, f.blinkRight].every(Number.isFinite) || !['OPEN', 'CLOSED', 'UNCERTAIN'].includes(f.eyes))) throw new Error('Resultado facial inválido.');
        clearTimeout(pending.timer); pendingFaces.delete(reply.id); temporaryAssets.delete(reply.id);
        if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply.faces);
      } catch { logger.write('invalid-face-reply'); }
    });
    win.on('close', event => {
      if (busy) {
        event.preventDefault(); pipeline?.cancel(); cancelExport = true;
        void dialog.showMessageBox(win!, { type: 'info', message: exporting ? 'Cancelando exportação com segurança. Feche novamente após a conclusão.' : 'Salvando o trabalho atual. Feche novamente quando a análise parar.' });
      }
    });
    win.on('closed', () => { win = null; faceWindow?.destroy(); app.quit(); });
    await win.loadURL('clickit://app/index.html');
  }).catch(e => { console.error(e); dialog.showErrorBox('ClickIT', e instanceof Error ? e.message : 'Falha ao iniciar.'); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { faceWindow?.destroy(); });
app.on('will-quit', () => { store?.close(); });
