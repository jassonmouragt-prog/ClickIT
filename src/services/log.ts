import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
export class Logger {
  private tail: Promise<void> = Promise.resolve();
  constructor(privateRoot: string, version: string) { this.root = privateRoot; this.version = version; }
  private root: string; private version: string;
  write(event: string, details: Record<string, string | number> = {}): void {
    this.tail = this.tail.then(async () => {
      await mkdir(this.root, { recursive: true }); const file = path.join(this.root, 'clickit.log');
      if (((await stat(file).catch(() => null))?.size ?? 0) > 2_000_000) {
        await unlink(file + '.2').catch(() => {}); await rename(file + '.1', file + '.2').catch(() => {}); await rename(file, file + '.1');
      }
      await appendFile(file, JSON.stringify({ time: new Date().toISOString(), version: this.version, event, ...details }) + '\n');
    }).catch(e => console.error('Não foi possível gravar log local', e instanceof Error ? e.name : 'Error'));
  }
}
