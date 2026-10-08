export type LicenseStatus = 'ACTIVE' | 'REVOKED';

/** Detecta violação de constraint única (Postgres 23505 / SQLite 2067). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; errcode?: number };
  return e?.code === '23505' || e?.errcode === 2067 || e?.errcode === 2068;
}

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
  orderId: string | null;
  purchasedVersion: string | null;
  updatesIncluded: number | null;
  updatesUsed: number | null;
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
  /** order_nsu do pedido comercial que originou esta licença. */
  orderId?: string | null;
  /** Versão adquirida (início do ciclo de atualizações inclusas). */
  purchasedVersion?: string | null;
  /** Atualizações PRINCIPAIS inclusas (patches não consomem). */
  updatesIncluded?: number | null;
  updatesUsed?: number | null;
}

export type TrialStatus = 'ACTIVE' | 'EXPIRED' | 'CONVERTED';
export interface TrialRow {
  id: string;
  deviceIdHash: string;
  startedAt: string;
  expiresAt: string;
  consumedAt: string;
  status: TrialStatus;
  appVersion: string;
  createdAt: string;
  convertedAt: string | null;
}
export interface StartTrialInput {
  id: string;
  deviceIdHash: string;
  startedAt: string;
  expiresAt: string;
  appVersion: string;
}

export interface LicenseDb {
  create(input: CreateLicenseInput): Promise<LicenseRow>;
  byKeyHash(hash: string): Promise<LicenseRow | null>;
  byId(id: string): Promise<LicenseRow | null>;
  /** Licença criada a partir de um order_nsu (idempotência de pedido). */
  byOrderNsu(orderNsu: string): Promise<LicenseRow | null>;
  /** SELECT 1 no banco; false se o banco estiver inacessível. */
  ping(): Promise<boolean>;
  list(): Promise<LicenseRow[]>;
  setStatus(id: string, status: LicenseStatus, at: string): Promise<void>;
  activation(licenseId: string, deviceId: string): Promise<ActivationRow | null>;
  activations(licenseId: string): Promise<ActivationRow[]>;
  activeCount(licenseId: string): Promise<number>;
  addActivation(licenseId: string, deviceId: string, deviceName: string, appVersion: string, at: string): Promise<ActivationRow>;
  deactivate(licenseId: string, deviceId: string): Promise<void>;
  touch(licenseId: string, deviceId: string, appVersion: string, at: string): Promise<void>;
  startTrial(input: StartTrialInput): Promise<TrialRow | null>;
  trialByDeviceHash(hash: string): Promise<TrialRow | null>;
  listTrials(now: string): Promise<TrialRow[]>;
  convertTrial(hash: string, at: string): Promise<void>;
  hasCommercialActivation(deviceId: string): Promise<boolean>;
  close(): Promise<void>;
}
