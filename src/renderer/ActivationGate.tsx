import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LicenseView } from '../licensing/types.ts';

const LICENSED = new Set(['VALID', 'VALID_OFFLINE']);

export function ActivationGate({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<LicenseView | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.clickit.licenseStatus().then(setStatus).catch(() => setStatus({ state: 'SERVER_UNAVAILABLE' }));
  }, []);
  const activate = useCallback(async () => {
    setBusy(true);
    try { setStatus(await window.clickit.activateLicense(key)); } catch { setStatus({ state: 'SERVER_UNAVAILABLE' }); }
    finally { setBusy(false); }
  }, [key]);
  const allowed = status !== null && LICENSED.has(status.state);
  if (allowed) {
    return <div className="license-app">{status?.state === 'VALID_OFFLINE' && <div className="license-offline-banner" role="status">{status.message}</div>}{children}</div>;
  }
  return (
    <div className="activation-screen">
      <div className="activation-card">
        <img src="./logo.png" alt="ClickIT" className="activation-logo"/>
        <span className="eyebrow">LICENCIAMENTO</span>
        <h1>Ative sua ClickIT</h1>
        <p className="muted">Digite a chave de licença recebida na compra. A ativação inicial usa internet uma única vez; depois a ClickIT funciona offline por vários dias.</p>
        <input className="mono" placeholder="CLICKIT-XXXX-XXXX-XXXX" value={key} onChange={e => setKey(e.target.value.toUpperCase())} autoComplete="off" aria-label="Chave de licença"/>
        <button className="button primary" disabled={busy} onClick={() => { void activate(); }}>{busy ? 'Validando...' : 'Ativar ClickIT'}</button>
        {status && !LICENSED.has(status.state) && status.state !== 'ACTIVATING' && <p className={`activation-status ${status.state === 'INVALID_KEY' || status.state === 'REVOKED' || status.state === 'EXPIRED' || status.state === 'DEVICE_LIMIT' || status.state === 'GRACE_EXPIRED' ? 'error' : 'warn'}`} role="alert">{status.message}</p>}
      </div>
    </div>
  );
}