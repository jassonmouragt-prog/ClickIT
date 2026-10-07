import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function Button({ primary, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }): ReactNode { return <button {...props} className={`${primary ? 'button primary' : 'button'} ${props.className ?? ''}`}>{children}</button>; }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }): ReactNode { return <span className={`badge ${tone}`}>{children}</span>; }
export function EmptyState({ title, children }: { title: string; children: ReactNode }): ReactNode { return <div className="empty"><span className="empty-symbol">▧</span><h2>{title}</h2>{children}</div>; }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} onCancel={close} aria-label={title}><div className="modal-title"><h2>{title}</h2><Button onClick={close} aria-label="Fechar">×</Button></div>{children}</dialog>;
}
export function ScoreBar({ label, value }: { label: string; value: number | null }): ReactNode { return <div className="score-row"><span>{label}</span><div className="score-track"><span style={{ width: `${value ?? 0}%` }}/></div><span className="mono">{value === null ? '—' : Math.round(value)}</span></div>; }
