import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { clearTimeout } from 'node:timers';
import path from 'node:path';
import { build } from 'esbuild';
import electron from 'electron';
import { root } from './scale-common.mjs';
import { ElectronMemory, exitFacts, takeFaceResponse } from './scale-harness-state.mjs';

export async function faceService(directory, cache, { timeoutMs = 60000, onDiagnostics = () => {} } = {}) {
  await mkdir(directory, { recursive: true });
  await build({ entryPoints: [path.join(root, 'scripts/scale-face-renderer.ts')], outfile: path.join(directory, 'renderer.js'), bundle: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'wasm-unsafe-eval\'; connect-src \'self\' clickit:; img-src \'self\' clickit: blob:; worker-src \'self\' blob:"><title>Scale validation</title>');
  const token = randomUUID();
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\clickit-scale-${token}` : path.join(directory, 'face.sock');
  const diagnostics = { starts: 0, requests: 0, responses: 0, successfulResponses: 0, responseIds: [], requestIds: [], timeoutMs, shutdownRequested: false, shutdownAcknowledged: false, internalShutdownReason: null, unexpectedExits: 0, events: [], stdout: path.join(directory, 'host-stdout.log'), stderr: path.join(directory, 'host-stderr.log'), lifecycle: path.join(directory, 'lifecycle.jsonl'), outcome: null };
  const trace = (event, details = {}) => { const row = { event, at: new Date().toISOString(), ...details }; diagnostics.events.push(row); appendFileSync(diagnostics.lifecycle, JSON.stringify(row) + '\n'); };
  const memory = new ElectronMemory(), pending = new Map();
  Object.defineProperty(diagnostics, 'memory', { enumerable: true, get: () => memory.read() });
  onDiagnostics(diagnostics);
  let child, socket, authenticated = false, closed = false, closing = false, failure = null, timedOut = false, spawnError = null, stderr = '', sequence = 0;
  const nativeEvidence = [];
  const fail = error => { failure ??= error; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); };
  const wait = (id, type) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { timedOut = true; trace('timeout', { id, type, timeoutMs }); fail(new Error(`Face timeout ${type} id=${id} after ${timeoutMs}ms`)); child?.kill(); }, timeoutMs);
    pending.set(id, { resolve, reject, timer, type });
  });
  const server = createServer(connection => {
    if (socket) { connection.destroy(); return; }
    socket = connection; trace('ipc-connected');
    socket.on('error', error => { trace('ipc-error', { error: String(error) }); memory.disconnect(); fail(error); });
    socket.on('close', () => { trace('ipc-closed'); memory.disconnect(); if (!closing && !closed) fail(new Error('Face IPC closed before requested shutdown')); });
    createInterface({ input: socket }).on('line', line => {
      try {
        const message = JSON.parse(line);
        if (!authenticated) {
          if (message.type !== 'HELLO' || message.token !== token) throw new Error('Face IPC handshake failed');
          authenticated = true; trace('ipc-authenticated', { pid: message.pid }); return;
        }
        if (message.type === 'MEMORY') { memory.update(message.bytes); return; }
        const { id, request } = takeFaceResponse(pending, message);
        clearTimeout(request.timer);
        if (message.type === 'RESPONSE') { diagnostics.responses++; diagnostics.responseIds.push(id); if (message.ok) diagnostics.successfulResponses++; }
        if (message.type === 'SHUTDOWN_ACK') { diagnostics.shutdownAcknowledged = message.ok; diagnostics.internalShutdownReason = message.reason; }
        trace('response-received', { id, type: message.type, ok: message.ok });
        if (message.ok === false) request.reject(new Error(message.error)); else request.resolve(message.result);
      } catch (error) { trace('protocol-error', { error: String(error) }); fail(error); }
    });
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); }); }
  catch (error) { memory.invalidate(); diagnostics.outcome = exitFacts({ processError: String(error) }); trace('ipc-listen-error', diagnostics.outcome); throw error; }
  const ready = wait('ready', 'READY');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  trace('spawn'); diagnostics.starts++;
  child = spawn(electron, [path.join(root, 'scripts/scale-face-host.mjs'), directory, cache, endpoint, token], { cwd: root, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => appendFileSync(diagnostics.stdout, chunk));
  child.stderr.on('data', chunk => { appendFileSync(diagnostics.stderr, chunk); stderr = (stderr + chunk).slice(-16000); });
  createInterface({ input: child.stdout }).on('line', line => {
    if (!line.startsWith('SCALE_FACE_EVENT=')) return;
    try {
      const event = JSON.parse(line.slice('SCALE_FACE_EVENT='.length)); trace('host:' + event.event, { hostEvent: event });
      if (event.shutdownReason || event.reason && event.event === 'shutdown-internal') diagnostics.internalShutdownReason = event.shutdownReason ?? event.reason;
      if (event.event === 'render-process-gone' && ['crashed', 'oom'].includes(event.reason)) nativeEvidence.push(event);
    } catch (error) { trace('log-parse-error', { error: String(error) }); }
  });
  child.once('error', error => { spawnError = String(error); memory.invalidate(); trace('process-error', { error: spawnError }); fail(error); });
  child.once('exit', (code, signal) => { memory.invalidate(); trace('process-exit', { exitCode: code, signal }); });
  const exited = new Promise(resolve => child.once('close', (code, signal) => {
    closed = true; memory.invalidate(); socket?.destroy(); server.close();
    if (/FATAL:electron[\\/]/.test(stderr)) nativeEvidence.push({ stderr });
    diagnostics.outcome = exitFacts({ exitCode: code, signal, requested: closing, acknowledged: diagnostics.shutdownAcknowledged, timeout: timedOut, processError: spawnError, nativeEvidence, reportWritten: !!diagnostics.internalShutdownReason && diagnostics.internalShutdownReason !== 'requested' });
    diagnostics.unexpectedExits = diagnostics.outcome.unexpectedExit ? 1 : 0;
    trace('process-close', diagnostics.outcome);
    if (!closing || !diagnostics.shutdownAcknowledged || code !== 0 || signal) fail(new Error(`Face host exit=${code} signal=${signal} reason=${diagnostics.internalShutdownReason ?? 'unknown'}; ${stderr}`));
    resolve(diagnostics.outcome);
  }));
  try { await ready; } catch (error) { if (!closed) child.kill(); await exited; throw error; }
  const request = (type, payload, responseType) => {
    if (failure || closed || !socket || socket.destroyed) return Promise.reject(failure ?? new Error('Face host unavailable'));
    const id = `face-${++sequence}`, result = wait(id, responseType);
    if (type === 'ANALYZE_FACE') { diagnostics.requests++; diagnostics.requestIds.push(id); }
    trace('request-sent', { id, type });
    socket.write(JSON.stringify({ id, type, ...payload }) + '\n', error => { if (error) fail(error); });
    return result;
  };
  return {
    pid: child.pid, diagnostics,
    get memory() { return memory.read(); },
    async detect(photoPath) { if (closing) throw new Error('Shutdown already requested'); return request('ANALYZE_FACE', { photoPath }, 'RESPONSE'); },
    async close() {
      if (!closed && !closing) {
        closing = true; diagnostics.shutdownRequested = true;
        try { await request('SHUTDOWN', {}, 'SHUTDOWN_ACK'); }
        catch (error) { if (!closed) child.kill(); await exited; throw error; }
      }
      if (!closed) {
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
        await exited; clearTimeout(timer);
      }
      if (failure) throw failure;
    }
  };
}
