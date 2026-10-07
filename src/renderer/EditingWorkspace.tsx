import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Modal } from '../components/ui.tsx';
import type { EditingProfile, EditingProfileInput } from '../editing/types.ts';
import type { ReferenceView } from '../editing/references.ts';
import { STYLE_STEPS, STYLE_SLIDERS, STYLE_CONCEPTS, newStyleProfile, quantitativeAnswer, conceptualAnswer, describeSlider, styleSummary } from '../editing/questionnaire.ts';

function message(error: unknown): string { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Não foi possível concluir. Tente novamente.'; }
export function EditingWorkspace(): React.JSX.Element {
  const [profiles, setProfiles] = useState<EditingProfile[]>([]), [references, setReferences] = useState<ReferenceView[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<EditingProfileInput | null>(null), [editingId, setEditingId] = useState<string | null>(null), [step, setStep] = useState(0);
  const [referencesFor, setReferencesFor] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: 'DELETE' | 'CANCEL'; id?: string; name?: string } | null>(null);
  const load = useCallback(async () => {
    const list = await window.clickit.editingProfiles(), refs = await window.clickit.editingReferences();
    setProfiles(list); setReferences(refs);
  }, []);
  useEffect(() => { let active = true;
    void (async () => {
      try { const list = await window.clickit.editingProfiles(), refs = await window.clickit.editingReferences(); if (active) { setProfiles(list); setReferences(refs); } }
      catch (e) { if (active) setError(message(e)); }
      finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  }, []);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const start = (profile?: EditingProfile): void => {
    setDraft(profile ? { name: profile.name, source: profile.source, presetPath: profile.presetPath, q: { ...profile.q }, c: { ...profile.c } } : newStyleProfile());
    setEditingId(profile?.id ?? null); setStep(0); setError(''); setNotice('');
  };
  const save = (): void => { if (!draft) return;
    void run(async () => {
      const input = { ...draft, name: draft.name.trim() };
      const saved = editingId ? await window.clickit.updateEditingProfile(editingId, input) : await window.clickit.createEditingProfile(input);
      setDraft(null); setReferencesFor(saved.id); await load(); setNotice(`Perfil “${saved.name}” salvo · versão ${saved.profileVersion}.`);
    });
  };
  const selectedProfile = profiles.find(p => p.id === referencesFor), selectedRefs = references.filter(r => r.profileId === referencesFor);
  return <section className="editing-page" aria-labelledby="editing-title">
    <header className="editing-header"><div><h1 id="editing-title">Editar</h1><p className="muted">Defina seu estilo. Guarde suas referências.</p></div>{!draft && <Button primary disabled={busy || loading} onClick={() => start()}>Criar perfil</Button>}</header>
    {error && <div className="banner error" role="alert">{error}<Button disabled={busy} onClick={() => { void run(load); }}>Tentar novamente</Button></div>}
    {notice && <div className="banner" role="status">{notice}</div>}
    {loading ? <p role="status" className="editing-loading">Carregando perfis de edição…</p> : draft ? <div className="style-wizard">
      <nav className="style-steps" aria-label="Etapas do perfil">{STYLE_STEPS.map((label, index) => <button key={label} aria-current={index === step ? 'step' : undefined} disabled={busy || (index > 0 && !draft.name.trim())} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
      <div className="style-wizard-body"><form className="style-form" onSubmit={event => { event.preventDefault(); if (step === 6) save(); else if (draft.name.trim()) setStep(step + 1); }}>
        <div className="style-step-heading"><p className="muted">Etapa {step + 1} de {STYLE_STEPS.length}</p><h2>{STYLE_STEPS[step]}</h2><p className="muted">{step === 6 ? 'Confira o que seu perfil expressa antes de salvar.' : 'Escolha suas preferências. Deixar em aberto também é uma opção.'}</p></div>
        {editingId && <p className="style-edit-warning">Alterar este perfil pode exigir regenerar planos de edição existentes.</p>}
        {step === 0 && <div className="style-name"><label htmlFor="style-name">Nome do perfil</label><input id="style-name" autoFocus required maxLength={120} disabled={busy} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Editorial suave"/><p className="muted">Um nome que você reconheça em outros trabalhos. As próximas etapas descrevem sua intenção; nenhuma fotografia será alterada.</p></div>}
        <div className="style-controls">{STYLE_SLIDERS.filter(s => s.step === step).map(s => <div className="style-slider" key={s.key}>
          <label htmlFor={`style-${s.key}`}>{s.label}</label><output htmlFor={`style-${s.key}`}>{describeSlider(s.key, draft.q[s.key])}</output>
          <input id={`style-${s.key}`} type="range" min={s.min} max={100} step={1} disabled={busy} value={draft.q[s.key] ?? 0} aria-valuetext={describeSlider(s.key, draft.q[s.key])} onChange={e => setDraft(quantitativeAnswer(draft, s.key, Number(e.target.value)))}/>
          <div className="style-slider-labels"><span>{s.low}</span><span>{s.high}</span></div><button type="button" className="style-reset" disabled={busy || draft.q[s.key] === null} onClick={() => setDraft(quantitativeAnswer(draft, s.key, null))}>Deixar em aberto</button>
        </div>)}</div>
        {STYLE_CONCEPTS.filter(s => s.step === step).map(s => <fieldset className="style-concept" key={s.key} disabled={busy}><legend>{s.label}</legend><div className="style-options">{[{ value: '', label: 'Em aberto' }, ...s.options].map(option => <button type="button" key={option.value} aria-pressed={(draft.c[s.key] ?? '') === option.value} onClick={() => setDraft(conceptualAnswer(draft, s.key, option.value || null))}>{option.label}</button>)}</div></fieldset>)}
        {step === 5 && <p className="muted">A estética geral é uma intenção. Ela não preenche nem substitui suas escolhas de luz, cor e textura.</p>}
        {step === 6 && <div className="style-review"><h3>{draft.name}</h3><p>Seu estilo tende a:</p><ul>{styleSummary(draft).map(line => <li key={line}>{line}</li>)}</ul><p className="muted">Você está salvando um perfil de preferências, não aplicando edição às fotografias.</p></div>}
        <footer className="style-wizard-footer"><Button type="button" disabled={busy} onClick={() => setConfirmation({ kind: 'CANCEL' })}>Cancelar</Button><div className="button-row">{step > 0 && <Button type="button" disabled={busy} onClick={() => setStep(step - 1)}>Voltar</Button>}<Button primary type="submit" disabled={busy || !draft.name.trim()}>{busy ? 'Salvando…' : step === 6 ? 'Salvar perfil' : 'Continuar'}</Button></div></footer>
      </form><aside className="style-live-summary" aria-label="Resumo do estilo"><h3>Seu estilo até aqui</h3><ul>{styleSummary(draft).slice(0, 8).map(line => <li key={line}>{line}</li>)}</ul>{styleSummary(draft).length > 8 && <p className="muted">Todas as escolhas aparecem na revisão final.</p>}</aside></div>
    </div> : <>
      <div className="editing-section-title"><h2>Perfis de edição</h2><span className="muted">{profiles.length} {profiles.length === 1 ? 'perfil' : 'perfis'} locais</span></div>
      {profiles.length ? <div className="style-profile-list">{profiles.map(p => <article className="style-profile" key={p.id}><div className="style-profile-description"><h3>{p.name}</h3><p>{styleSummary(p).slice(0, 3).join(' · ')}</p><small>Versão {p.profileVersion} · Atualizado em {new Date(p.updatedAt).toLocaleDateString('pt-BR')} · {references.filter(r => r.profileId === p.id).length} referências</small></div><div className="button-row"><Button disabled={busy} onClick={() => start(p)}>Editar perfil</Button><Button disabled={busy} aria-pressed={referencesFor === p.id} onClick={() => { setReferencesFor(p.id); void run(load); }}>Referências</Button><Button disabled={busy} onClick={() => { void run(async () => { const copy = await window.clickit.duplicateEditingProfile(p.id); await load(); setNotice(`“${copy.name}” criado sem copiar referências.`); }); }}>Duplicar</Button><Button disabled={busy} onClick={() => setConfirmation({ kind: 'DELETE', id: p.id, name: p.name })}>Excluir</Button></div></article>)}</div> : <EmptyState title="Seu primeiro perfil de estilo"><p>Descreva suas preferências de luz, cor e textura em poucos passos.</p><Button primary onClick={() => start()}>Criar primeiro perfil</Button></EmptyState>}
      {selectedProfile && <section className="style-reference-section" aria-labelledby="reference-title"><div className="editing-section-title"><div><h2 id="reference-title">Referências de {selectedProfile.name}</h2><p className="muted">Para comparar visualmente. Seu estilo não será inferido dessas imagens.</p></div><div className="button-row"><Button disabled={busy} onClick={() => { void run(async () => { const refs = await window.clickit.addEditingReference(selectedProfile.id, 'REFERENCE'); await load(); if (refs.length) setNotice('Referência adicionada.'); }); }}>Adicionar referência</Button><Button disabled={busy} onClick={() => { void run(async () => { const refs = await window.clickit.addEditingReference(selectedProfile.id, 'PAIR'); await load(); if (refs.length) setNotice('Par Antes/Depois adicionado.'); }); }}>Adicionar Antes/Depois</Button></div></div>
        {selectedRefs.length ? <div className="style-reference-grid">{selectedRefs.map(ref => <ReferenceTile key={ref.id} reference={ref} pairNumber={ref.pairId ? [...new Set(selectedRefs.map(r => r.pairId).filter(Boolean))].indexOf(ref.pairId) + 1 : null} busy={busy} remove={() => { void run(async () => { await window.clickit.removeEditingReference(ref.id); await load(); setNotice('Referência removida. Arquivo preservado.'); }); }}/>)}</div> : <p className="style-reference-empty">Nenhuma referência associada. Você pode adicionar de 3 a 10 imagens para organizar sua intenção visual.</p>}
      </section>}
      <p className="editing-future muted">Geração de edição · Em breve</p>
    </>}
    {confirmation && <Modal title={confirmation.kind === 'DELETE' ? 'Excluir perfil?' : 'Descartar alterações?'} close={() => { if (!busy) setConfirmation(null); }}><p>{confirmation.kind === 'DELETE' ? `Excluir “${confirmation.name}”? Planos históricos e referências não serão apagados automaticamente.` : 'As alterações ainda não salvas serão descartadas.'}</p><div className="button-row"><Button disabled={busy} onClick={() => setConfirmation(null)}>Manter</Button><Button primary disabled={busy} onClick={() => {
      if (confirmation.kind === 'CANCEL') { setDraft(null); setConfirmation(null); return; }
      void run(async () => { await window.clickit.deleteEditingProfile(confirmation.id!); if (referencesFor === confirmation.id) setReferencesFor(null); setConfirmation(null); await load(); setNotice('Perfil excluído.'); });
    }}>{confirmation.kind === 'DELETE' ? 'Confirmar exclusão' : 'Descartar'}</Button></div>{error && <p role="alert" className="style-dialog-error">{error}</p>}</Modal>}
  </section>;
}
function ReferenceTile({ reference, pairNumber, busy, remove }: { reference: ReferenceView; pairNumber: number | null; busy: boolean; remove: () => void }): React.JSX.Element {
  const [failed, setFailed] = useState(false), name = reference.externalPath.split(/[\\/]/).at(-1) ?? 'Referência';
  return <article className="style-reference"><div className="style-reference-image">{reference.available && !failed ? <img loading="lazy" src={reference.thumbnailUrl} alt={name} onError={() => setFailed(true)}/> : <p>Referência indisponível</p>}</div><div className="style-reference-info"><div><strong>{reference.kind === 'BEFORE' ? 'Antes' : reference.kind === 'AFTER' ? 'Depois' : 'Referência'}{pairNumber && ` · Par ${pairNumber}`}</strong><p title={reference.externalPath}>{name}</p></div><Button disabled={busy} aria-label={`Remover ${name}`} onClick={remove}>Remover</Button></div></article>;
}
