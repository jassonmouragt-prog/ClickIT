import { createHash, randomBytes } from 'node:crypto';

export function generateLicenseKey(): string {
  const hex = randomBytes(6).toString('hex').toUpperCase();
  const groups = hex.match(/.{4}/g) ?? [];
  return `CLICKIT-${groups.slice(0, 3).join('-')}`;
}

export function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '-');
}

export function validLicenseKey(value: unknown): value is string {
  return typeof value === 'string' && /^CLICKIT-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(value.trim().toUpperCase());
}

export function hashLicenseKey(value: string): string {
  return createHash('sha256').update(normalizeLicenseKey(value)).digest('hex');
}