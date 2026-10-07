import { OFFLINE_GRACE_MS, REVALIDATION_MS, type LicensePayload, type LicenseView, type LicenseState } from './types.ts';
import { verifyLicense } from './token.ts';
import { validLicenseKey } from './keys.ts';
import type { LicenseFileStore, LocalLicenseState } from './storage.ts';

export interface LicenseHttp {
  post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: { [key: string]: unknown } }>;
}

export interface LicenseManagerOptions {
  file: LicenseFileStore;
  http: LicenseHttp;
  publicKey: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  devAllowed?: boolean;
  now?: () => number;
}

export const devAllowed = (isPackaged: boolean, raw: string | undefined): boolean => !isPackaged && raw === '1';

const MESSAGES: Record<LicenseState, string> = {
  UNACTIVATED: 'Ative sua ClickIT para começar a usar.',
  ACTIVATING: 'Validando sua licença...',
  VALID: 'Licença ativa.',
  VALID_OFFLINE: 'Sem conexão no momento. Sua licença continua válida por um tempo.',
  INVALID_KEY: 'Chave de licença inválida. Verifique e tente novamente.',
  REVOKED: 'Esta licença foi revogada. Contate o suporte para resolver.',
  EXPIRED: 'Esta licença expirou.',
  DEVICE_LIMIT: 'Limite de dispositivos atingido. Desative outro dispositivo ou entre em contato.',
  SERVER_UNAVAILABLE: 'Não foi possível conectar ao servidor de licenças. Verifique sua conexão e tente novamente.',
  GRACE_EXPIRED: 'Período offline esgotado. Conecte-se à internet para revalidar sua licença.',
  DEVICE_MISMATCH: 'Sua licença foi emitida para outro dispositivo.',
  LOCAL_TAMPERED: 'Os dados locais de licença estão corrompidos. Ative novamente sua ClickIT.'
};

const SERVER_REASONS: Record<string, LicenseState> = { INVALID_KEY: 'INVALID_KEY', REVOKED: 'REVOKED', EXPIRED: 'EXPIRED', DEVICE_LIMIT: 'DEVICE_LIMIT' };

export class LicenseManager {
  private readonly options: LicenseManagerOptions;
  private stored: LocalLicenseState | null = null;

  constructor(options: LicenseManagerOptions) {
    this.options = options;
    this.stored = this.options.file.load();
  }

  private get now(): number {
    return (this.options.now ?? Date.now)();
  }

  private get bypass(): boolean {
    return this.options.devAllowed === true;
  }

  private view(state: LicenseState, extra: Partial<LicenseView> = {}): LicenseView {
    return { state, message: MESSAGES[state], ...extra };
  }

  private licensedLocal(payload: LicensePayload, local: LocalLicenseState, state: LicenseState): LicenseView {
    return this.view(state, { plan: payload.plan, licenseId: payload.licenseId, checkAfter: payload.checkAfter, lastCheck: local.lastCheck, deviceName: local.deviceName, appVersion: this.options.appVersion });
  }

  private offline(local: LocalLicenseState, payload: LicensePayload): LicenseView {
    const graceEnd = local.lastCheck + OFFLINE_GRACE_MS;
    if (this.now <= graceEnd) {
      const offlineDaysLeft = Math.max(0, Math.ceil((graceEnd - this.now) / 86_400_000));
      const base = this.licensedLocal(payload, local, 'VALID_OFFLINE');
      return { ...base, message: offlineDaysLeft <= 10 ? `Sem conexão. Sua licença expira em ${offlineDaysLeft} dia${offlineDaysLeft === 1 ? '' : 's'} sem internet.` : MESSAGES.VALID_OFFLINE, offlineDaysLeft };
    }
    return this.licensedLocal(payload, local, 'GRACE_EXPIRED');
  }

  private save(local: LocalLicenseState): void {
    this.options.file.save(local);
    this.stored = local;
  }

  async status(): Promise<LicenseView> {
    if (this.bypass) return this.view('VALID', { plan: 'LIFETIME', checkAfter: this.now + REVALIDATION_MS });
    const local = this.stored;
    if (!local) return this.view('UNACTIVATED');
    const payload = verifyLicense(local.token, this.options.publicKey);
    if (!payload) return this.view('LOCAL_TAMPERED');
    if (payload.deviceId !== this.options.deviceId) return this.view('DEVICE_MISMATCH');
    if (payload.validUntil !== null && payload.validUntil < this.now) return this.licensedLocal(payload, local, 'EXPIRED');
    if (this.now - local.lastCheck >= REVALIDATION_MS) return this.revalidate(local, payload);
    return this.licensedLocal(payload, local, 'VALID');
  }

  private async revalidate(local: LocalLicenseState, payload: LicensePayload): Promise<LicenseView> {
    try {
      const response = await this.options.http.post('/licenses/validate', { licenseId: payload.licenseId, deviceId: this.options.deviceId });
      if (!response.ok) return this.offline(local, payload);
      const valid = response.data.valid === true;
      if (valid) {
        this.save({ ...local, lastCheck: this.now });
        return this.licensedLocal(payload, this.stored!, 'VALID');
      }
      const reason = SERVER_REASONS[String(response.data.reason ?? '')] ?? 'REVOKED';
      return this.licensedLocal(payload, local, reason);
    } catch {
      return this.offline(local, payload);
    }
  }

  async activate(licenseKey: string): Promise<LicenseView> {
    if (!validLicenseKey(licenseKey)) return this.view('INVALID_KEY');
    try {
      const response = await this.options.http.post('/licenses/activate', {
        licenseKey: licenseKey.trim().toUpperCase(),
        deviceId: this.options.deviceId,
        deviceName: this.options.deviceName,
        appVersion: this.options.appVersion
      });
      if (!response.ok) return this.view('SERVER_UNAVAILABLE');
      if (response.data.ok !== true) {
        const reason = SERVER_REASONS[String(response.data.reason ?? '')] ?? 'INVALID_KEY';
        return this.view(reason);
      }
      const token = String(response.data.token ?? '');
      const payload = verifyLicense(token, this.options.publicKey);
      if (!payload || payload.deviceId !== this.options.deviceId) return this.view('SERVER_UNAVAILABLE');
      this.save({ token, deviceId: this.options.deviceId, deviceName: this.options.deviceName, lastCheck: this.now, activatedAt: this.now });
      return this.licensedLocal(payload, this.stored!, 'VALID');
    } catch {
      return this.view('SERVER_UNAVAILABLE');
    }
  }

  async deactivate(): Promise<LicenseView> {
    const local = this.stored;
    this.options.file.clear();
    this.stored = null;
    if (local) {
      const payload = verifyLicense(local.token, this.options.publicKey);
      if (payload) {
        try {
          await this.options.http.post('/licenses/deactivate', { licenseId: payload.licenseId, deviceId: this.options.deviceId });
        } catch {
          // Best effort: local state is cleared regardless and the slot frees on next activation.
        }
      }
    }
    return this.view('UNACTIVATED');
  }
}