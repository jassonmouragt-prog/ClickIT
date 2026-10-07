import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { LicensePayload } from './types.ts';

export interface SignedLicense {
  token: string;
  payload: LicensePayload;
  signature: string;
}

export function b64u(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('base64url');
}

export function unb64u(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

export function isLicensePayload(value: unknown): value is LicensePayload {
  const v = value as Record<string, unknown>;
  return !!v && typeof v === 'object' && typeof v.licenseId === 'string' && typeof v.deviceId === 'string'
    && v.plan === 'LIFETIME' && typeof v.issuedAt === 'number' && typeof v.checkAfter === 'number'
    && (v.validUntil === null || typeof v.validUntil === 'number') && typeof v.maxDevices === 'number';
}

export function parseLicense(token: string): { payload: LicensePayload; signature: string } | null {
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match?.[1] || !match[2]) return null;
  try {
    const payload = JSON.parse(unb64u(match[1]).toString('utf8')) as unknown;
    if (!isLicensePayload(payload)) return null;
    return { payload, signature: match[2] };
  } catch {
    return null;
  }
}

export function signLicense(payload: LicensePayload, privateKeyPem: string): SignedLicense {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, body, key);
  return { token: `${b64u(body)}.${b64u(signature)}`, payload, signature: b64u(signature) };
}

export function verifyLicense(token: string, publicKeyPem: string): LicensePayload | null {
  const parsed = parseLicense(token);
  if (!parsed) return null;
  try {
    const key = createPublicKey(publicKeyPem);
    const body = unb64u(token.split('.')[0]!);
    const signature = unb64u(parsed.signature);
    if (!verify(null, body, key, signature)) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}