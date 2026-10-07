import { app, BrowserWindow, protocol, net, session } from 'electron';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [directory, photo, requireFace, analyzeFaces] = process.argv.slice(2);
const started = performance.now();
const stage = name => console.log('CLICKIT_FACE_STAGE=' + JSON.stringify({ name, timestamp: new Date().toISOString() }));
stage('process-start');
app.setPath('userData', path.join(directory, 'user-data'));
app.setPath('sessionData', path.join(directory, 'session-data'));
protocol.registerSchemesAsPrivileged([{ scheme: 'clickit', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
let window;

// Do NOT top-level-await app.whenReady(): Electron waits for ESM evaluation
// before emitting ready, so that creates a circular startup dependency.
async function main() {
  try {
    stage('app-ready-wait');
    await app.whenReady();
    stage('app-ready');
    session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    protocol.handle('clickit', request => {
      const url = new URL(request.url);
      let file;
      if (url.hostname === 'photo' && url.pathname === '/input') file = photo;
      if (url.hostname === 'models' && url.pathname === '/face_landmarker.task') file = path.join(root, 'resources/models/face_landmarker.task');
      if (url.hostname === 'app') {
        if (['/index.html', '/probe.js'].includes(url.pathname)) file = path.join(directory, url.pathname.slice(1));
        else if (/^\/wasm\/[a-zA-Z0-9_.-]+\.(wasm|js)$/.test(url.pathname)) file = path.join(root, 'node_modules/@mediapipe/tasks-vision', url.pathname.slice(1));
      }
      console.log(`[face asset] ${request.url} -> ${file ?? '404'}`);
      return file ? net.fetch(pathToFileURL(file).href) : new globalThis.Response('Not found', { status: 404 });
    });
    stage('create-renderer');
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    window.webContents.on('console-message', details => {
      console.log(details.message.startsWith('CLICKIT_FACE_STAGE=') ? details.message : `[face renderer] ${details.message}`);
    });
    window.webContents.on('render-process-gone', (_event, details) => { console.error(`Renderer encerrou: ${JSON.stringify(details)}`); app.exit(1); });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    stage('load-page');
    await window.loadURL('clickit://app/index.html');
    stage('import-renderer');
    const data = await window.webContents.executeJavaScript(`import('clickit://app/probe.js').then(module => module.run(${analyzeFaces === 'true'}))`);
    if (requireFace === 'true' && data.facesDetected < 1) throw new Error('Nenhum rosto detectado na fotografia de aceitação.');
    stage('shutdown');
    data.totalProcessMs = performance.now() - started;
    process.stdout.write('CLICKIT_FACE_RESULT=' + JSON.stringify({ ok: true, data }) + '\n', () => { window.destroy(); app.quit(); });
  } catch (error) {
    process.stdout.write('CLICKIT_FACE_RESULT=' + JSON.stringify({ ok: false, error: error.stack ?? String(error) }) + '\n', () => { window?.destroy(); app.exit(1); });
  }
}
void main();
