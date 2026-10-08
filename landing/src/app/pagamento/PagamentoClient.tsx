'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

type State = 'PROCESSING' | 'PENDING' | 'PAID' | 'LICENSE_READY' | 'FAILED';

interface StatusPayload {
  ok: boolean;
  status: string;
  licenseKey?: string;
  downloadUrl?: string;
  receiptUrl?: string | null;
  license?: { plan: string; maxDevices: number; updatesIncluded: number; validUntil: string | null };
}

const POLL_MS = 2500;
const MAX_POLLS = 72;

const COPY =
  'Depois dessas atualizações, sua versão continuará funcionando normalmente. Apenas novas versões futuras poderão exigir uma nova licença de atualização.';

/**
 * Página de retorno do pagamento.
 *
 * Apenas localiza/consulta o pedido — nunca gera licença por si só.
 * Enquanto o webhook não chega, o backend reconcilia via payment_check.
 */
export function PagamentoClient(): ReactNode {
  const [state, setState] = useState<State>('PROCESSING');
  const [message, setMessage] = useState('');
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [license, setLicense] = useState<StatusPayload['license'] | null>(null);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const attempts = useRef(0);

  const refresh = useCallback(() => setTick(value => value + 1), []);

  useEffect(() => {
    const search = window.location.search;
    const query = new URLSearchParams(search);
    const locator = query.get('o') ?? query.get('order_nsu');
    if (!locator) {
      setState('FAILED');
      setMessage('Pedido não encontrado. Use o link enviado após o pagamento ou fale com o suporte.');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    attempts.current = 0;

    const schedule = (): void => {
      if (cancelled || attempts.current >= MAX_POLLS) return;
      timer = setTimeout(() => void poll(), POLL_MS);
    };

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      attempts.current += 1;
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(locator)}/status${search}`, {
          cache: 'no-store',
        });
        if (response.status === 404) {
          setState('FAILED');
          setMessage('Pedido não encontrado. Use o link enviado após o pagamento ou fale com o suporte.');
          return;
        }
        const data = (await response.json()) as StatusPayload;
        if (!data.ok) throw new Error('status inválido');

        if (data.licenseKey) {
          setLicenseKey(data.licenseKey);
          setDownloadUrl(data.downloadUrl ?? null);
          setReceiptUrl(data.receiptUrl ?? null);
          setLicense(data.license ?? null);
          setState('LICENSE_READY');
          return;
        }
        if (data.status === 'PAID') {
          setState('PAID');
        } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
          setState('FAILED');
          setMessage('Não conseguimos confirmar este pagamento. Fale com o suporte informando o seu e-mail.');
          return;
        } else {
          setState('PENDING');
        }
        schedule();
      } catch {
        schedule();
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tick]);

  async function copyLicense(): Promise<void> {
    if (!licenseKey) return;
    try {
      await navigator.clipboard.writeText(licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <Link href="/#topo" className="mb-10 inline-flex" aria-label="Voltar para a página inicial">
        <Logo />
      </Link>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-[linear-gradient(165deg,rgba(20,26,37,0.96),rgba(10,14,21,0.96))] p-7 shadow-panel md:p-9">
        {state === 'LICENSE_READY' && licenseKey ? (
          <div>
            <p className="eyebrow">pagamento aprovado</p>
            <h1 className="mt-4 text-[clamp(26px,3.6vw,34px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              Pagamento aprovado!
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">Sua licença ClickIT:</p>

            <div className="mt-3 rounded-2xl border border-hairline bg-white/[0.04] px-5 py-6 text-center">
              <p className="font-mono text-[clamp(19px,4vw,26px)] font-semibold tracking-[0.06em] text-cloud select-all">
                {licenseKey}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={() => void copyLicense()}>
                {copied ? 'Licença copiada!' : 'Copiar licença'}
              </button>
              {downloadUrl ? (
                <a className="btn-ghost flex-1" href={downloadUrl} rel="noopener noreferrer">
                  Baixar ClickIT para Windows
                </a>
              ) : null}
            </div>

            <ul className="mt-7 grid gap-2.5 text-[14.5px] leading-relaxed text-mist">
              <li>Licença vitalícia</li>
              <li>Até {license?.maxDevices ?? 2} dispositivos</li>
              <li>{license?.updatesIncluded ?? 3} próximas versões principais incluídas</li>
            </ul>

            <p className="mt-5 rounded-xl border border-hairline bg-white/[0.03] p-4 text-[13.5px] leading-relaxed text-mist">
              {COPY}
            </p>

            {receiptUrl ? (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-block text-[13px] text-fog transition-colors hover:text-mist"
              >
                Ver comprovante do pagamento
              </a>
            ) : null}
          </div>
        ) : state === 'FAILED' ? (
          <div>
            <p className="eyebrow">pagamento</p>
            <h1 className="mt-4 text-[clamp(24px,3.4vw,32px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              Não foi possível concluir
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">{message}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={refresh}>
                Tentar novamente
              </button>
              <Link href="/#faq" className="btn-ghost flex-1">
                Falar com o suporte
              </Link>
            </div>
          </div>
        ) : state === 'PAID' ? (
          <div>
            <p className="eyebrow">pagamento aprovado</p>
            <h1 className="mt-4 text-[clamp(24px,3.4vw,32px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              Pagamento aprovado!
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">
              Estamos emitindo sua licença ClickIT. Esta página atualiza sozinha.
            </p>
            <Spinner />
          </div>
        ) : state === 'PENDING' ? (
          <div>
            <p className="eyebrow">aguardando pagamento</p>
            <h1 className="mt-4 text-[clamp(24px,3.4vw,32px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              Ainda não recebemos o pagamento
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">
              Se você já pagou, a confirmação pode levar alguns segundos. Esta página atualiza sozinha.
            </p>
            <Spinner />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary flex-1" onClick={refresh}>
                Verificar novamente
              </button>
              <Link href="/checkout" className="btn-ghost flex-1">
                Voltar para o checkout
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <p className="eyebrow">confirmando pagamento</p>
            <h1 className="mt-4 text-[clamp(24px,3.4vw,32px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              Confirmando seu pagamento…
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">
              Não feche esta página — em instantes mostramos sua licença.
            </p>
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner(): ReactNode {
  return (
    <div
      className="mt-6 h-6 w-6 animate-spin rounded-full border-2 border-hairline border-t-[rgba(57,139,255,0.9)]"
      role="status"
      aria-label="Carregando"
    />
  );
}
