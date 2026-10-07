import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface LocalLicenseState {
  token: string;
  deviceId: string;
  deviceName: string;
  lastCheck: number;
  activatedAt: number;
}

export interface SecretCipher {
  encrypt(plaintext: string): Buffer;
  decrypt(blob: Buffer): string;
}

export interface LicenseFileStore {
  load(): LocalLicenseState | null;
  save(state: LocalLicenseState): void;
  clear(): void;
}

export function plainCipher(): SecretCipher {
  return { encrypt: plaintext => Buffer.from(plaintext, 'utf8'), decrypt: blob => blob.toString('utf8') };
}

export function fileLicenseStore(file: string, cipher: SecretCipher): LicenseFileStore {
  const load = (): LocalLicenseState | null => {
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(cipher.decrypt(readFileSync(file))) as LocalLicenseState;
    } catch {
      return null;
    }
  };
  return {
    load,
    save: state => {
      mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      writeFileSync(temp, cipher.encrypt(JSON.stringify(state)));
      try { unlinkSync(file); } catch { /* first write */ }
      try { renameSync(temp, file); } catch { /* best effort atomic rename */ }
    },
    clear: () => {
      try { unlinkSync(file); } catch { /* already absent */ }
    }
  };
}