'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { PRODUCT_FULL_NAME, PRODUCT_NAME, PRODUCT_PRICE_DISPLAY, PRODUCT_PRICE_READY } from '@/config/product';
import { Logo } from '@/components/Logo';

const RESUMO = [
  'Licença vitalícia',
  'Até 2 dispositivos',
  '3 próximas versões principais incluídas',
  'Trial permanece separado',
];

type Phase = 'idle' | 'sending' | 'unavailable' | 'error';

const FIELD =
  'w-full rounded-xl border border-hairline bg-white/[0.04] px-4 py-3 text-[15px] text-cloud outline-none transition-colors placeholder:text-fog focus:border-[rgba(57,139,255,0.55)]';

export function CheckoutPanel(): ReactNode {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (phase === 'sending') return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
    };
    setPhase('sending');
    setMessage('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; checkoutUrl?: string; code?: string } | null;
      if (response.ok && body?.ok && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      if (response.status === 503 || body?.code === 'NOT_CONFIGURED') {
        setPhase('unavailable');
        return;
      }
      if (response.status === 400) {
        setPhase('error');
        setMessage('Confira nome, e-mail e WhatsApp e tente novamente.');
        return;
      }
      setPhase('error');
      setMessage('Não foi possível iniciar o pagamento agora. Tente novamente em instantes.');
    } catch {
      setPhase('error');
      setMessage('Falha de conexão. Verifique sua internet e tente de novo.');
    }
  }

  const sending = phase === 'sending';

  return (
    <div className="w-full max-w-3xl">
      <Link href="/#topo" className="mb-10 inline-flex" aria-label="Voltar para a página inicial">
        <Logo />
      </Link>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-[linear-gradient(165deg,rgba(20,26,37,0.96),rgba(10,14,21,0.96))] shadow-panel">
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="p-7 md:p-9">
            <p className="eyebrow">checkout seguro</p>
            <h1 className="mt-4 text-[clamp(26px,3.6vw,34px)] leading-tight font-semibold tracking-[-0.03em] text-cloud">
              {PRODUCT_FULL_NAME}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-mist">
              Pagamento único processado pela InfinitePay. Depois da confirmação, sua licença aparece na próxima
              página — sem esperar e-mail.
            </p>

            <form id="checkout-form" onSubmit={submit} className="mt-7 grid gap-4" noValidate>
              <div className="grid gap-1.5">
                <label htmlFor="name" className="text-[13px] font-medium text-mist">
                  Nome
                </label>
                <input id="name" name="name" type="text" autoComplete="name" required minLength={2} maxLength={120} className={FIELD} placeholder="Como devemos chamar você" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="email" className="text-[13px] font-medium text-mist">
                  E-mail
                </label>
                <input id="email" name="email" type="email" autoComplete="email" required maxLength={160} className={FIELD} placeholder="voce@exemplo.com" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="phone" className="text-[13px] font-medium text-mist">
                  WhatsApp
                </label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" required inputMode="tel" className={FIELD} placeholder="(11) 99999-9999" />
              </div>

              {phase === 'error' ? (
                <p role="alert" className="text-[13.5px] leading-relaxed text-[#ff9fb0]">
                  {message}
                </p>
              ) : null}
              {phase === 'unavailable' ? (
                <div className="rounded-xl border border-hairline bg-white/[0.03] p-4 text-center">
                  <p className="text-[15px] font-semibold text-cloud">Disponível em breve</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-mist">
                    O checkout está sendo preparado. Enquanto isso, experimente a ClickIT por 20 minutos.
                  </p>
                </div>
              ) : null}
            </form>
          </div>

          <div className="flex flex-col justify-between gap-6 border-t border-hairline bg-white/[0.03] p-7 md:border-t-0 md:border-l md:p-9">
            <div>
              <p className="eyebrow">resumo</p>
              <p className="mt-3 text-[15px] font-semibold text-cloud">{PRODUCT_NAME}</p>
              <p className="mt-3 text-[38px] leading-none font-semibold tracking-[-0.04em] text-cloud">
                {PRODUCT_PRICE_DISPLAY}
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
                {PRODUCT_PRICE_READY ? 'Pagamento único · sem renovação automática' : 'Preço a definir'}
              </p>

              <ul className="mt-6 grid gap-2.5">
                {RESUMO.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-mist">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="m5 12.5 4.2 4.2L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <button type="submit" form="checkout-form" className="btn-primary w-full" disabled={sending}>
                {sending ? 'Preparando pagamento…' : 'Ir para pagamento'}
              </button>

              <Link href="/#trial" className="btn-ghost mt-3 w-full">
                Testar grátis por 20 minutos
              </Link>
              <Link href="/#topo" className="mt-4 block text-center text-[13px] text-fog transition-colors hover:text-mist">
                Voltar para a página
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
