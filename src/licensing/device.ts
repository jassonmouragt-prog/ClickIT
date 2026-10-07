import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

export type GuidReader = () => Promise<string | null>;

export const RE_MACHINE_GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function readWindowsMachineGuid(): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { out += chunk; });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const match = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/i.exec(out);
      resolve(match?.[1] ?? null);
    });
  });
}

export function deviceIdFromGuid(guid: string): string {
  return createHash('sha256').update(`clickit-device:${guid.toLowerCase()}`).digest('hex').slice(0, 32);
}

export async function currentDeviceId(read: GuidReader = readWindowsMachineGuid): Promise<string> {
  const guid = await read();
  if (guid && RE_MACHINE_GUID.test(guid)) return deviceIdFromGuid(guid);
  const fallback = `${process.env.COMPUTERNAME ?? hostname()}|${process.env.USERNAME ?? ''}|${process.env.LOCALAPPDATA ?? ''}`;
  return createHash('sha256').update(`clickit-device-fallback:${fallback}`).digest('hex').slice(0, 32);
}

export function currentDeviceName(): string {
  return hostname().trim().slice(0, 60);
}