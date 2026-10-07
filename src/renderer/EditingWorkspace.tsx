import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Modal } from '../components/ui.tsx';
import type { EditingPlan, EditingPlanView, EditingProfile, EditingProfileInput, PlanScope, SliderValue } from '../editing/types.ts';
import type { ReferenceView } from '../editing/references.ts';
import type { Photo, Project } from '../types/domain.ts';
import { STYLE_STEPS, STYLE_SLIDERS, STYLE_CONCEPTS, newStyleProfile, quantitativeAnswer, conceptualAnswer, describeSlider, styleSummary } from '../editing/questionnaire.ts';

function message(error: unknown): string { return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Não foi possível concluir. Tente novamente.'; }
function planLabel(key: string): string { return STYLE_SLIDERS.find(s => s.key === key)?.label.replace(/\?$/, '') ?? key; }
function planStatus(status: EditingPlan['status']): string {
  return { DRAFT: 'Rascunho', GENERATED: 'Gerado', REVIEWED: 'Revisado', EXPORTED: 'Exportado', STALE: 'Desatualizado' }[status];
}
export function EditingWorkspace(): React.JSX.Element {
  const [profiles, setProfiles] = useState<EditingProfile[]>([]), [references, setReferences] = useState<ReferenceView[]>([]);
  const [projects, setProjects] = useState<Project[]>([]), [projectPhotos, setProjectPhotos] = useState<Photo[]>([]);
  const [plans, setPlans] = useState<EditingPlanView[]>([]);
  const [plansFor, setPlansFor] = useState<string | null>(null), [planProject, setPlanProject] = useState(''), [planScope, setPlanScope] = useState<PlanScope['kind']>('PICKS'), [planPhoto, setPlanPhoto] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<EditingProfileInput | null>(null), [editingId, setEditingId] = useState<string | null>(null), [step, setStep] = useState(0);
  const [referencesFor, setReferencesFor] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: 'DELETE' | 'CANCEL'; id?: string; name?: string } | null>(null);
  const load = useCallback(async () => {
    const list = await window.clickit.editingProfiles(), refs = await window.clickit.editingReferences();
    setProfiles(list); setReferences(refs);
  }, []);
  const loadProjects = useCallback(async () => { setProjects(await window.clickit.projects()); }, []);
  useEffect(() => { let active = true;
    void (async () => {
      try { const list = await window.clickit.editingProfiles(), refs = await window.clickit.editingReferences(); if (active) { setProfiles(list); setReferences(refs); void loadProjects(); } }
      catch (e) { if (active) setError(message(e)); }
      finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  }, [loadProjects]);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const loadPlans = async (profileId: string): Promise<void> => { setPlans(await window.clickit.editingPlans(profileId)); };
  const openPlans = (profileId: string): void => {
    if (plansFor === profileId) { setPlansFor(null); setPlans([]); return; }
    setPlansFor(profileId); void loadPlans(profileId);
  };
  const selectPlanProject = (projectId: string): void => {
    setPlanProject(projectId); setPlanPhoto('');
    if (projectId) void window.clickit.photos(projectId).then(setProjectPhotos).catch(() => setProjectPhotos([]));
    else setProjectPhotos([]);
  };
  const generate = (profileId: string): void => {
    void run(async () => {
      const scope: PlanScope = planScope === 'PHOTO' ? { kind: 'PHOTO', photoId: planPhoto } : { kind: planScope as Exclude<PlanScope['kind'], 'PHOTO'>, projectId: planProject };
      const result = await window.clickit.generateEditingPlans(profileId, scope);
      await loadPlans(profileId);
      const n = result.generated.length, skipped = result.skipped.length ? ` · ${result.skipped.length} ignorada${result.skipped.length > 1 ? 's' : ''} sem análise.` : '';
      setNotice(`${n} ${n === 1 ? 'plano gerado' : 'planos gerados'}.${skipped}`);
    });
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
      {profiles.length ? <div className="style-profile-list">{profiles.map(p => <article className="style-profile" key={p.id}><div className="style-profile-description"><h3>{p.name}</h3><p>{styleSummary(p).slice(0, 3).join(' · ')}</p><small>Versão {p.profileVersion} · Atualizado em {new Date(p.updatedAt).toLocaleDateString('pt-BR')} · {references.filter(r => r.profileId === p.id).length} referências</small></div><div className="button-row"><Button disabled={busy} onClick={() => start(p)}>Editar perfil</Button><Button disabled={busy} aria-pressed={referencesFor === p.id} onClick={() => { setReferencesFor(p.id); void run(load); }}>Referências</Button><Button disabled={busy} aria-pressed={plansFor === p.id} onClick={() => openPlans(p.id)}>Planos</Button><Button disabled={busy} onClick={() => { void run(async () => { const copy = await window.clickit.duplicateEditingProfile(p.id); await load(); setNotice(`“${copy.name}” criado sem copiar referências.`); }); }}>Duplicar</Button><Button disabled={busy} onClick={() => setConfirmation({ kind: 'DELETE', id: p.id, name: p.name })}>Excluir</Button></div></article>)}</div> : <EmptyState title="Seu primeiro perfil de estilo"><p>Descreva suas preferências de luz, cor e textura em poucos passos.</p><Button primary onClick={() => start()}>Criar primeiro perfil</Button></EmptyState>}
      {selectedProfile && <section className="style-reference-section" aria-labelledby="reference-title"><div className="editing-section-title"><div><h2 id="reference-title">Referências de {selectedProfile.name}</h2><p className="muted">Para comparar visualmente. Seu estilo não será inferido dessas imagens.</p></div><div className="button-row"><Button disabled={busy} onClick={() => { void run(async () => { const refs = await window.clickit.addEditingReference(selectedProfile.id, 'REFERENCE'); await load(); if (refs.length) setNotice('Referência adicionada.'); }); }}>Adicionar referência</Button><Button disabled={busy} onClick={() => { void run(async () => { const refs = await window.clickit.addEditingReference(selectedProfile.id, 'PAIR'); await load(); if (refs.length) setNotice('Par Antes/Depois adicionado.'); }); }}>Adicionar Antes/Depois</Button></div></div>
        {selectedRefs.length ? <div className="style-reference-grid">{selectedRefs.map(ref => <ReferenceTile key={ref.id} reference={ref} pairNumber={ref.pairId ? [...new Set(selectedRefs.map(r => r.pairId).filter(Boolean))].indexOf(ref.pairId) + 1 : null} busy={busy} remove={() => { void run(async () => { await window.clickit.removeEditingReference(ref.id); await load(); setNotice('Referência removida. Arquivo preservado.'); }); }}/>)}</div> : <p className="style-reference-empty">Nenhuma referência associada. Você pode adicionar de 3 a 10 imagens para organizar sua intenção visual.</p>}
      </section>}
      {plansFor && profiles.find(p => p.id === plansFor) && <PlanPanel profileName={profiles.find(p => p.id === plansFor)!.name} projects={projects} projectPhotos={projectPhotos} plans={plans} busy={busy} planScope={planScope} planProject={planProject} planPhoto={planPhoto} onScope={setPlanScope} onProject={selectPlanProject} onPhoto={setPlanPhoto} onGenerate={() => generate(plansFor)} />}
    </>}
    {confirmation && <Modal title={confirmation.kind === 'DELETE' ? 'Excluir perfil?' : 'Descartar alterações?'} close={() => { if (!busy) setConfirmation(null); }}><p>{confirmation.kind === 'DELETE' ? `Excluir “${confirmation.name}”? Planos históricos e referências não serão apagados automaticamente.` : 'As alterações ainda não salvas serão descartadas.'}</p><div className="button-row"><Button disabled={busy} onClick={() => setConfirmation(null)}>Manter</Button><Button primary disabled={busy} onClick={() => {
      if (confirmation.kind === 'CANCEL') { setDraft(null); setConfirmation(null); return; }
      void run(async () => { await window.clickit.deleteEditingProfile(confirmation.id!); if (referencesFor === confirmation.id) setReferencesFor(null); if (plansFor === confirmation.id) { setPlansFor(null); setPlans([]); } setConfirmation(null); await load(); setNotice('Perfil excluído.'); });
    }}>{confirmation.kind === 'DELETE' ? 'Confirmar exclusão' : 'Descartar'}</Button></div>{error && <p role="alert" className="style-dialog-error">{error}</p>}</Modal>}
  </section>;
}
function ReferenceTile({ reference, pairNumber, busy, remove }: { reference: ReferenceView; pairNumber: number | null; busy: boolean; remove: () => void }): React.JSX.Element {
  const [failed, setFailed] = useState(false), name = reference.externalPath.split(/[\\/]/).at(-1) ?? 'Referência';
  return <article className="style-reference"><div className="style-reference-image">{reference.available && !failed ? <img loading="lazy" src={reference.thumbnailUrl} alt={name} onError={() => setFailed(true)}/> : <p>Referência indisponível</p>}</div><div className="style-reference-info"><div><strong>{reference.kind === 'BEFORE' ? 'Antes' : reference.kind === 'AFTER' ? 'Depois' : 'Referência'}{pairNumber && ` · Par ${pairNumber}`}</strong><p title={reference.externalPath}>{name}</p></div><Button disabled={busy} aria-label={`Remover ${name}`} onClick={remove}>Remover</Button></div></article>;
}
const SCOPE_OPTIONS: { value: PlanScope['kind']; label: string }[] = [{ value: 'PICKS', label: 'ClickIT Picks' }, { value: 'SELECTED', label: 'Selecionadas' }, { value: 'FAVORITES', label: 'Favoritas' }, { value: 'PHOTO', label: 'Esta foto' }];
function PlanPanel({ profileName, projects, projectPhotos, plans, busy, planScope, planProject, planPhoto, onScope, onProject, onPhoto, onGenerate }: {
  profileName: string; projects: Project[]; projectPhotos: Photo[]; plans: EditingPlanView[]; busy: boolean;
  planScope: PlanScope['kind']; planProject: string; planPhoto: string;
  onScope: (s: PlanScope['kind']) => void; onProject: (id: string) => void; onPhoto: (id: string) => void; onGenerate: () => void;
}): React.JSX.Element {
  const ready = planScope === 'PHOTO' ? !!planPhoto : !!planProject;
  return <section className="plan-section" aria-labelledby="plan-title">
    <div className="editing-section-title"><div><h2 id="plan-title">Plano de edição · {profileName}</h2><p className="muted">Determinístico e auditável: perfil × sinais reais da foto. A foto original nunca é alterada. Sinais que o pipeline ainda não mede ficam como pendentes — jamais inventados.</p></div></div>
    <div className="plan-scope">
      <label className="plan-field"><span>Projeto</span><select disabled={busy} value={planProject} onChange={e => onProject(e.target.value)}>{!planProject && <option value="">Escolher projeto…</option>}{projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.analyzed} analisadas</option>)}</select></label>
      <fieldset className="plan-scope-kinds" disabled={busy}><legend>Gerar plano para</legend>{SCOPE_OPTIONS.map(({ value, label }) => <button type="button" key={value} aria-pressed={planScope === value} onClick={() => onScope(value)}>{label}</button>)}</fieldset>
      {planScope === 'PHOTO' && <label className="plan-field"><span>Foto analisada</span><select disabled={busy} value={planPhoto} onChange={e => onPhoto(e.target.value)}>{!planPhoto && <option value="">Escolher foto…</option>}{projectPhotos.filter(p => p.analysisStatus === 'DONE').map(p => <option key={p.id} value={p.id}>{p.fileName}</option>)}</select></label>}
      <div className="button-row"><Button primary disabled={busy || !ready} onClick={onGenerate}>Gerar plano de edição</Button></div>
    </div>
    {plans.length ? <div className="plan-list">{plans.map(view => <PlanCard key={view.plan.id} view={view} />)}</div> : <p className="plan-empty muted">Nenhum plano ainda. Escolha um projeto e gere o primeiro plano para este perfil.</p>}
  </section>;
}
function PlanCard({ view }: { view: EditingPlanView }): React.JSX.Element {
  const { plan, photo } = view;
  const final = new Map(plan.finalAdjustment.map(a => [a.param, a.value] as const));
  const valueRows = STYLE_SLIDERS.filter(s => final.get(s.key) !== undefined);
  const sign = (v: number): string => `${v > 0 ? '+' : ''}${v}`;
  return <article className="plan-card">
    <header className="plan-card-header">{photo.previewUrl ? <img className="plan-photo" src={photo.previewUrl} alt="Pré-visualização" loading="lazy" /> : <div className="plan-photo plan-photo-empty" />}<div><h3>{photo.fileName}</h3><p className="muted" title={photo.originalPath}>{photo.originalPath}</p><p><span className={`plan-badge plan-badge-${plan.status.toLowerCase()}`}>{planStatus(plan.status)}</span> Perfil versão {plan.profileVersion} · Motor {plan.engineVersion}</p>{plan.generatedAt ? <small>Gerado em {new Date(plan.generatedAt).toLocaleString('pt-BR')}</small> : <small>Não gerado</small>}</div></header>
    <div className="plan-card-body">
      <section><h4>Valores de edição</h4>{valueRows.length ? <table className="plan-table"><tbody>{valueRows.map(s => { const v = final.get(s.key)!; return <tr key={s.key}><th scope="row">{s.label}</th><td className="plan-value">{sign(v)}</td><td>{describeSlider(s.key, v as SliderValue)}</td></tr>; })}</tbody></table> : <p className="muted">Perfil aberto e cena sem correção: nenhum ajuste final.</p>}</section>
      <section><h4>Por que a ClickIT sugeriu isso?</h4>{plan.explanation.length ? <ol className="plan-explanation">{plan.explanation.map(e => <li key={e.param}><div><strong>{planLabel(e.param)}</strong><span className="plan-nums">base {sign(e.base)} · cena {sign(e.scene)} · final {sign(e.final)}</span></div><p>{e.note}</p></li>)}</ol> : <p className="muted">Sem ajustes para explicar.</p>}</section>
      {plan.sceneAdvisories.length > 0 && <section><h4>Notas da foto</h4><ul className="plan-advisories">{plan.sceneAdvisories.map((a, i) => <li key={i}><strong>{a.kind === 'ADVISORY' ? 'Nota' : 'Observação'}:</strong> {a.message}</li>)}</ul></section>}
      {plan.missingSignals.length > 0 && <p className="plan-missing muted">Sinais ainda não medidos pelo pipeline atual: {plan.missingSignals.join(', ')}.</p>}
    </div>
  </article>;
}
