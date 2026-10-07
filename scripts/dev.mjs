import { spawn } from 'node:child_process';
// A production-origin renderer keeps development and packaged IPC security identical.
const build = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
build.on('exit', async code => {
  if (code) { process.exitCode = code; return; }
  const { default: electron } = await import('electron');
  const child = spawn(electron, ['.'], { stdio: 'inherit' });
  child.on('exit', status => { process.exitCode = status ?? 1; });
});
