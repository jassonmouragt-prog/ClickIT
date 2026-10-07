import { build } from 'esbuild';
import { build as vite } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
await build({ entryPoints: { main: 'src/main/index.ts', preload: 'src/preload/index.ts', analysis: 'src/workers/analysis.ts', preview: 'src/workers/preview.ts', grouping: 'src/workers/grouping.ts' }, outdir: 'dist', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', target: 'node24', format: 'cjs', packages: 'external', sourcemap: true });
await vite();
