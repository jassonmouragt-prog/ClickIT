export const REVALIDATION_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
/** Janela do teste grátis emitida pela API: 20 minutos (mesma duração da landing). */
export const TRIAL_DURATION_MS = 20 * 60 * 1000;

export type LicensePlan = 'LIFETIME' | 'TRIAL';

export type LicenseState =
  | 'UNACTIVATED'
  | 'ACTIVATING'
  | 'VALID'
  | 'VALID_OFFLINE'
  | 'INVALID_KEY'
  | 'REVOKED'
  | 'EXPIRED'
  | 'DEVICE_LIMIT'
  | 'SERVER_UNAVAILABLE'
  | 'GRACE_EXPIRED'
  | 'DEVICE_MISMATCH'
  | 'LOCAL_TAMPERED';

export interface LicensePayload {
  licenseId: string;
  deviceId: string;
  plan: LicensePlan;
  issuedAt: number;
  checkAfter: number;
  validUntil: number | null;
  maxDevices: number;
}

export interface LicenseView {
  state: LicenseState;
  message?: string;
  plan?: LicensePlan;
  licenseId?: string;
  checkAfter?: number;
  lastCheck?: number;
  offlineDaysLeft?: number;
  deviceName?: string;
  appVersion?: string;
}

export const LICENSED: ReadonlySet<LicenseState> = new Set<LicenseState>(['VALID', 'VALID_OFFLINE']);