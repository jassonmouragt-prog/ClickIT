export type LicenseStatus = 'ACTIVE' | 'REVOKED';

export interface LicenseRow {
  id: string;
  keyHash: string;
  customerName: string;
  customerEmail: string;
  status: LicenseStatus;
  plan: string;
  maxDevices: number;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ActivationRow {
  id: string;
  licenseId: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  activatedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface CreateLicenseInput {
  id: string;
  keyHash: string;
  customerName: string;
  customerEmail: string;
  plan: string;
  maxDevices: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface LicenseDb {
  create(input: CreateLicenseInput): Promise<LicenseRow>;
  byKeyHash(hash: string): Promise<LicenseRow | null>;
  byId(id: string): Promise<LicenseRow | null>;
  list(): Promise<LicenseRow[]>;
  setStatus(id: string, status: LicenseStatus, at: string): Promise<void>;
  activation(licenseId: string, deviceId: string): Promise<ActivationRow | null>;
  activations(licenseId: string): Promise<ActivationRow[]>;
  activeCount(licenseId: string): Promise<number>;
  addActivation(licenseId: string, deviceId: string, deviceName: string, appVersion: string, at: string): Promise<ActivationRow>;
  deactivate(licenseId: string, deviceId: string): Promise<void>;
  touch(licenseId: string, deviceId: string, appVersion: string, at: string): Promise<void>;
  close(): Promise<void>;
}