import { app, BrowserWindow, protocol, net, session } from 'electron';
import { pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import { setInterval, clearInterval } from 'node:timers';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { root, contained } from './scale-common.mjs';

const [directory, cache, endpoint, token] = process.argv.slice(2);
let window, currentPhoto, timer, socket, shutdownReason = null, ready = false;
const trace = (event, details = {}) => {
  const line = JSON.stringify({ event, at: new Date().toISOString(), pid: process.pid, ...details });
  appendFileSync(path.join(directory, 'host-internal.jsonl'), line + '\n');
  console.log('SCALE_FACE_EVENT=' + line);
};
const send = (message, callback) => socket.write(JSON.stringify(message) + '\n', callback);
function terminate(reason, error) {
  if (shutdownReason && shutdownReason !== 'requested') return;
  shutdownReason = reason; clearInterval(timer);
  trace('shutdown-internal', { reason, error: error ? String(error.stack ?? error) : null });
  trace('app-exit-called', { code: 1, reason }); app.exit(1);
}
trace('process-start', { transport: 'dedicated-local-socket; stdin unused' });
process.on('exit', code => trace('process-exit', { code, shutdownReason }));
process.on('uncaughtException', error => terminate('uncaught-exception', error));
process.on('unhandledRejection', error => terminate('unhandled-rejection', error));
app.on('before-quit', () => trace('before-quit', { shutdownReason }));
app.on('will-quit', () => trace('will-quit', { shutdownReason }));
app.on('quit', (_event, code) => trace('app-quit', { code, shutdownReason }));
app.on('window-all-closed', () => { trace('window-all-closed'); if (!shutdownReason) terminate('renderer-closed'); });
app.setPath('userData', path.join(directory, 'user-data'));
app.setPath('sessionData', path.join(directory, 'session-data'));
protocol.registerSchemesAsPrivileged([{ scheme: 'clickit', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
async function main() {
  socket = createConnection(endpoint);
  socket.on('error', error => terminate('ipc-error', error));
  socket.on('end', () => { trace('ipc-end'); if (!shutdownReason) terminate('ipc-ended-before-shutdown'); });
  socket.on('close', () => { trace('ipc-close'); if (!shutdownReason) terminate('ipc-closed-before-shutdown'); });
  await new Promise(resolve => socket.once('connect', resolve));
  trace('ipc-connected'); send({ type: 'HELLO', token, pid: process.pid });
  const input = createInterface({ input: socket });
  let chain = Promise.resolve();
  const seen = new Set();
  input.on('line', line => {
    trace('message-received');
    chain = chain.then(async () => {
      const request = JSON.parse(line);
      if (!request.id || seen.has(request.id)) throw new Error('Missing or duplicate request ID');
      seen.add(request.id);
      if (request.type === 'SHUTDOWN') {
        shutdownReason = 'requested'; trace('shutdown-requested', { id: request.id }); clearInterval(timer);
        if (window && !window.isDestroyed()) await window.webContents.executeJavaScript("import('clickit://app/renderer.js').then(m => m.close())");
        await new Promise(resolve => send({ id: request.id, type: 'SHUTDOWN_ACK', ok: true, reason: shutdownReason }, resolve));
        trace('shutdown-ack-sent', { id: request.id }); socket.end();
        window?.destroy(); trace('app-quit-called', { reason: shutdownReason }); app.quit(); return;
      }
      try {
        if (request.type !== 'ANALYZE_FACE' || !ready || shutdownReason) throw new Error('Invalid request or host not ready');
        if (typeof request.photoPath !== 'string' || !contained(cache, request.photoPath)) throw new Error('Preview outside isolated cache');
        currentPhoto = request.photoPath; trace('photo-received', { id: request.id, photoPath: currentPhoto });
        const result = await window.webContents.executeJavaScript(`import('clickit://app/renderer.js').then(m => m.detect(${JSON.stringify(request.id)}))`);
        await new Promise(resolve => send({ id: request.id, type: 'RESPONSE', ok: true, result }, resolve));
        trace('response-sent', { id: request.id, ok: true });
      } catch (error) {
        trace('js-error', { id: request.id, error: error.stack ?? String(error) });
        await new Promise(resolve => send({ id: request.id, type: 'RESPONSE', ok: false, error: error.stack ?? String(error) }, resolve));
        trace('response-sent', { id: request.id, ok: false });
      }
      trace('waiting-next-message');
    }).catch(error => terminate('protocol-or-js-error', error));
  });
  input.on('close', () => { trace('protocol-reader-close'); if (!shutdownReason) terminate('ipc-reader-closed'); });
  await app.whenReady(); trace('app-ready');
  session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  protocol.handle('clickit', request => {
    const url = new URL(request.url);
    let file;
    if (url.hostname === 'photo' && url.pathname === '/input') file = currentPhoto;
    if (url.hostname === 'models' && url.pathname === '/face_landmarker.task') file = path.join(root, 'resources/models/face_landmarker.task');
    if (url.hostname === 'app') {
      if (['/index.html', '/renderer.js'].includes(url.pathname)) file = path.join(directory, url.pathname.slice(1));
      else if (/^\/wasm\/[a-zA-Z0-9_.-]+\.(wasm|js)$/.test(url.pathname)) file = path.join(root, 'node_modules/@mediapipe/tasks-vision', url.pathname.slice(1));
    }
    return file ? net.fetch(pathToFileURL(file).href) : new globalThis.Response('Not found', { status: 404 });
  });
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  trace('renderer-created');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => { trace('renderer-closed'); if (!shutdownReason) terminate('renderer-closed'); });
  window.webContents.on('render-process-gone', (_event, details) => { trace('render-process-gone', details); terminate('renderer-gone'); });
  window.webContents.on('console-message', details => {
    if (details.message.startsWith('SCALE_RENDERER=')) {
      try { const m = JSON.parse(details.message.slice('SCALE_RENDERER='.length)); trace(m.event, m); }
      catch (error) { trace('renderer-log-error', { error: String(error) }); }
    } else trace('renderer-console', { message: details.message });
  });
  await window.loadURL('clickit://app/index.html');
  await window.webContents.executeJavaScript("import('clickit://app/renderer.js').then(m => m.initialize())");
  trace('model-loaded');
  const sample = () => { if (!shutdownReason && !socket.destroyed) send({ type: 'MEMORY', bytes: app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize * 1024, 0) }); };
  sample(); timer = setInterval(sample, 500); ready = true;
  send({ type: 'READY' }); trace('ready'); trace('waiting-next-message');
}
void main().catch(error => terminate('startup-js-error', error));
