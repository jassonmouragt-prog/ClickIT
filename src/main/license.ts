import { app, safeStorage } from 'electron';
import path from 'node:path';
import { currentDeviceId, currentDeviceName } from '../licensing/device.ts';
import { LicenseManager, devAllowed, type LicenseHttp } from '../licensing/manager.ts';
import { fileLicenseStore, plainCipher, type SecretCipher } from '../licensing/storage.ts';
import { LICENSE_PUBLIC_KEY } from '../licensing/publicKey.ts';

export function licenseApiUrl(): string {
  return process.env.CLICKIT_LICENSE_API ?? 'https://clickit-license-api.vercel.app';
}

function cipher(): SecretCipher {
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypt: value => safeStorage.encryptString(value), decrypt: blob => safeStorage.decryptString(blob) };
  }
  return plainCipher();
}

export async function installLicenseManager(): Promise<LicenseManager> {
  const base = licenseApiUrl();
  const http: LicenseHttp = {
    post: async (pathname, body) => {
      const response = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as { [key: string]: unknown };
      return { ok: response.ok, status: response.status, data };
    }
  };
  const deviceId = await currentDeviceId();
  return new LicenseManager({
    file: fileLicenseStore(path.join(app.getPath('userData'), 'license.bin'), cipher()),
    http,
    publicKey: LICENSE_PUBLIC_KEY,
    deviceId,
    deviceName: currentDeviceName(),
    appVersion: app.getVersion(),
    devAllowed: devAllowed(app.isPackaged, process.env.CLICKIT_DEV_LICENSE)
  });
}