import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { clearTimeout } from 'node:timers';
import path from 'node:path';
import { root } from './models.mjs';

export async function faceProbe(photo, requireFace = false, analyzeFaces = false) {
  await access(photo);
  await access(path.join(root, 'resources/models/face_landmarker.task'));
  const { build } = await import('esbuild');
  const { default: electron } = await import('electron');
  await mkdir(path.join(root, '.test-tmp'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.test-tmp/face-probe-'));
  const stages = [];
  const preparation = name => { const entry = { name, timestamp: new Date().toISOString() }; stages.push(entry); console.log(`[face ${entry.timestamp}] ${name}`); };
  try {
    preparation('prepare-assets');
    await mkdir(path.join(directory, 'user-data'));
    await mkdir(path.join(directory, 'session-data'));
    await build({ entryPoints: [path.join(root, 'scripts/face-probe-renderer.ts')], outfile: path.join(directory, 'probe.js'), bundle: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
    await writeFile(path.join(directory, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' clickit:; img-src 'self' clickit: blob:; worker-src 'self' blob:"><title>ClickIT model diagnostic</title>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    preparation('spawn-electron');
    return await new Promise((resolve, reject) => {
      const child = spawn(electron, [path.join(root, 'scripts/face-probe-electron.mjs'), directory, path.resolve(photo), String(requireFace), String(analyzeFaces)], { cwd: root, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let pending = '', stderr = '', result, timer, timeoutError;
      const armDeadline = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timeoutError = new Error(`Face timeout: 30s na etapa ${stages.at(-1)?.name}. Últimas etapas: ${JSON.stringify(stages)}. stderr=${stderr}`);
          console.error(timeoutError.message);
          child.kill();
          reject(timeoutError);
        }, 30000);
      };
      const lineReceived = line => {
        if (line.startsWith('CLICKIT_FACE_STAGE=')) {
          const entry = JSON.parse(line.slice('CLICKIT_FACE_STAGE='.length));
          stages.push(entry); console.log(`[face ${entry.timestamp}] ${entry.name}`); armDeadline();
        } else if (line.startsWith('CLICKIT_FACE_RESULT=')) {
          result = JSON.parse(line.slice('CLICKIT_FACE_RESULT='.length));
        } else if (line.trim()) console.log(line);
      };
      armDeadline();
      child.stdout.on('data', chunk => {
        pending += chunk;
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end).trimEnd(); pending = pending.slice(end + 1);
          try { lineReceived(line); } catch (error) { clearTimeout(timer); child.kill(); reject(error); }
        }
      });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); console.error(String(chunk).trimEnd()); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => {
        clearTimeout(timer);
        try {
          if (pending.trim()) lineReceived(pending.trim());
          if (timeoutError) throw timeoutError;
          if (code !== 0 || !result?.ok) throw new Error(`Face falhou na etapa ${stages.at(-1)?.name}; exit=${code}; ${result?.error ?? stderr ?? 'sem resultado'}`);
          resolve({ ...result.data, stages, processExited: true, exitCode: code });
        } catch (error) { reject(error); }
        finally { clearTimeout(timer); }
      });
    });
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--photo') {
    console.error('Uso: npm run face:test -- --photo "C:\\dev\\ClickIT\\FOTO A.png"'); process.exitCode = 2;
  } else {
    try {
      const data = await faceProbe(path.resolve(process.argv[3]), true);
      console.log(JSON.stringify({ ok: true, data }, null, 2));
      await writeFile(path.join(root, 'docs/evidence/face-test.json'), JSON.stringify({ ok: true, data }, null, 2));
    } catch (error) { console.error(error.stack); process.exitCode = 1; }
  }
}
