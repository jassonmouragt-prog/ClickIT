import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DecisionPatch, Photo, Progress, Project, Settings, SystemInfo } from '../types/domain.ts';
import { Button, EmptyState, Modal } from '../components/ui.tsx';
import { PhotoGrid } from '../components/PhotoGrid.tsx';
import { Inspector } from '../components/Inspector.tsx';
import { PhotoViewer } from '../components/PhotoViewer.tsx';
import { FILTERS, filterPhotos, isSelected } from '../features/photos.ts';
import type { Filter } from '../features/photos.ts';
import { useHotkeys } from '../features/hotkeys.ts';
import { EditingWorkspace } from './EditingWorkspace.tsx';
export function App(): React.JSX.Element {
  const [section, setSection] = useState<'library' | 'editing'>('library');
  const [projects, setProjects] = useState<Project[]>([]), [projectId, setProjectId] = useState<string | null>(null), [photos, setPhotos] = useState<Photo[]>([]);
  const [active, setActive] = useState<string | null>(null), [filter, setFilter] = useState<Filter>('ALL'), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [sort, setSort] = useState('capture'), [size, setSize] = useState(230), [compared, setCompared] = useState<string[]>([]), [view, setView] = useState<'grid' | 'viewer' | 'compare'>('grid');
  const [modal, setModal] = useState<'create' | 'settings' | 'export' | 'errors' | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null), [working, setWorking] = useState(false), [system, setSystem] = useState<SystemInfo | null>(null), [settings, setSettings] = useState<Settings>({ mode: 'AUTO', concurrency: 1 });
  const project = projects.find(p => p.id === projectId), photo = photos.find(p => p.id === active);
  const currentProject = useRef<string | null>(null), refreshRequest = useRef(0), operations = useRef(0);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const id = currentProject.current, request = ++refreshRequest.current;
    setLoading(true);
    try {
      const [list, items] = await Promise.all([window.clickit.projects(), id ? window.clickit.photos(id) : Promise.resolve([])]);
      if (request !== refreshRequest.current || id !== currentProject.current) return;
      setProjects(list); setPhotos(items);
    } finally { if (request === refreshRequest.current) setLoading(false); }
  }, []);
  const run = useCallback(async (fn: () => Promise<void>) => { setError(''); operations.current++; setWorking(true); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Não foi possível concluir.'); } finally { operations.current--; setWorking(operations.current > 0); } }, []);
  useEffect(() => { void run(refresh); }, [projectId, refresh, run]);
  useEffect(() => { void Promise.all([window.clickit.system(), window.clickit.settings(), window.clickit.progress()]).then(([info, config, p]) => { setSystem(info); setSettings(config); setProgress(p); }).catch(e => setError(String(e))); }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (): void => { timer = undefined; void refresh().catch(e => setError(String(e))); };
    const unsubscribe = window.clickit.onProgress(p => {
      setProgress(p);
      if (!p.active) { clearTimeout(timer); update(); }
      else if (p.projectId === currentProject.current && (p.kind === 'PREVIEW' || (p.kind === 'ANALYSIS' && p.done > 0 && p.done % 25 === 0)) && !timer) timer = setTimeout(update, 200);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [refresh]);
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 180); return () => clearTimeout(timer); }, [query]);
  const visible = useMemo(() => {
    const result = filterPhotos(photos, filter, search);
    return result.sort((a, b) => sort === 'score' ? (b.analysis?.overall ?? -1) - (a.analysis?.overall ?? -1) : sort === 'rating' ? b.rating - a.rating : sort === 'group' ? (a.groupId ?? '').localeCompare(b.groupId ?? '') || (a.rank ?? 0) - (b.rank ?? 0) : sort === 'name' ? a.fileName.localeCompare(b.fileName) : (a.captureDate ?? a.fileName).localeCompare(b.captureDate ?? b.fileName));
  }, [photos, filter, search, sort]);
  const selected = photos.filter(isSelected), totalBytes = selected.reduce((sum, p) => sum + p.fileSize, 0);
  const decide = useCallback((id: string, patch: DecisionPatch) => {
    void window.clickit.decide(id, patch).then(() => setPhotos(current => current.map(p => p.id === id ? { ...p, ...patch, decision: patch.keep ? 'SELECTED' : patch.status ?? p.decision, source: 'USER' } : p))).catch(e => setError(String(e)));
  }, []);
  const compare = (): void => {
    let ids = compared;
    if (ids.length < 2 && photo?.groupId) ids = photos.filter(p => p.groupId === photo.groupId).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, 6).map(p => p.id);
    if (ids.length < 2) { setNotice('Marque de 2 a 6 fotografias nos quadrados da grade para comparar.'); return; }
    setCompared(ids); setView('compare');
  };
  useHotkeys(action => {
    if (action === 'grid' || action === 'close') { setView('grid'); return; }
    if (action === 'compare') { compare(); return; }
    if (!photo) return;
    if (action === 'previous' || action === 'next') { const i = visible.findIndex(p => p.id === active); setActive(visible[Math.max(0, Math.min(visible.length - 1, i + (action === 'next' ? 1 : -1)))]?.id ?? active); }
    else if (action === 'viewer') setView(v => v === 'viewer' ? 'grid' : 'viewer');
    else if (action === 'select') decide(photo.id, { status: isSelected(photo) ? 'UNDECIDED' : 'SELECTED' });
    else if (action === 'review') decide(photo.id, { status: 'REVIEW' });
    else if (action === 'reject') decide(photo.id, { status: 'REJECTED' });
    else if (action === 'favorite') decide(photo.id, { favorite: !photo.favorite });
    else if (action.startsWith('rating')) decide(photo.id, { rating: Number(action.slice(-1)) });
  }, !modal && section === 'library');
  const selectProject = (id: string | null): void => { setSection('library'); if (id === currentProject.current) return; currentProject.current = id; refreshRequest.current++; setProjectId(id); setPhotos([]); setActive(null); setCompared([]); setView('grid'); setFilter('ALL'); setQuery(''); setSearch(''); };
  const toggleCompare = (id: string): void => { setCompared(ids => ids.includes(id) ? ids.filter(i => i !== id) : ids.length < 6 ? [...ids, id] : ids); };
  const busy = working || !!progress?.active;
  return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={() => selectProject(null)} aria-label="ClickIT início"><img src="./logo.png" alt="ClickIT"/></button><button className={`nav-item ${section === 'editing' ? 'selected' : ''}`} aria-current={section === 'editing' ? 'page' : undefined} onClick={() => { setSection('editing'); setView('grid'); }}>Editar</button><span className="eyebrow">BIBLIOTECA</span><nav>{FILTERS.slice(0, 6).filter(([id]) => id !== 'PICKS').map(([id, label]) => <button key={id} className={section === 'library' && filter === id && projectId ? 'nav-item selected' : 'nav-item'} disabled={!projectId} onClick={() => { setSection('library'); setFilter(id); setView('grid'); }}><span>{id === 'FAVORITES' ? '♡' : id === 'REVIEW' ? '◷' : id === 'REJECTED' ? '×' : id === 'SELECTED' ? '✓' : '▧'} {label}</span>{projectId && <small>{filterPhotos(photos, id, '').length}</small>}</button>)}</nav><div className="section-label"><span className="eyebrow">PROJETOS</span><button onClick={() => setModal('create')} title="Novo projeto" aria-label="Novo projeto">＋</button></div><div className="project-links">{projects.map(p => <button key={p.id} onClick={() => selectProject(p.id)} className={`nav-item ${p.id === projectId ? 'current' : ''}`}><span>▱ {p.name}</span><small>{p.count}</small></button>)}</div><div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal('settings')}>⚙ Configurações</button><p className="privacy">◈ Processamento local<br/><span>Suas fotografias permanecem no seu computador.</span></p></div></aside>
    <main className="main-area">{error && <div className="banner error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dispensar erro">×</button></div>}{notice && <div className="banner" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dispensar aviso">×</button></div>}
    {section === 'editing' ? <EditingWorkspace/> : !projectId ? <section className="home"><div className="home-heading"><span className="eyebrow">SELEÇÃO INTELIGENTE PARA FOTÓGRAFOS</span><h1>Menos tempo selecionando.<br/><span>Mais tempo criando.</span></h1><p>Você continua escolhendo suas fotos.<br/>Só não precisa mais começar do zero.</p><Button primary onClick={() => setModal('create')}>＋ Novo projeto</Button><div className="steps">01 Escolha uma pasta <span>→</span> 02 Analise <span>→</span> 03 Revise <span>→</span> 04 Exporte</div></div><div className="recent-title"><h2>Projetos recentes</h2><span>{projects.length} projetos locais</span></div>{projects.length ? <div className="recent-projects">{projects.map(p => <button key={p.id} className="project-card" onClick={() => selectProject(p.id)}><span className="project-icon">▧</span><div><h3>{p.name}</h3><p>{p.count.toLocaleString('pt-BR')} fotografias · {new Date(p.updatedAt).toLocaleDateString('pt-BR')}</p></div><span className="project-state">{p.status === 'INTERRUPTED' ? 'Interrompido' : p.status === 'READY' ? 'Pronto para revisar' : 'Em preparação'} →</span></button>)}</div> : <EmptyState title="Nenhum projeto ainda"><p>Comece selecionando uma pasta com suas fotografias.</p></EmptyState>}</section> : <>
      <header className="project-header"><div><span className="eyebrow">PROJETO LOCAL</span><h1>{project?.name}</h1></div><div className="button-row"><Button disabled={busy} onClick={() => { setFilter('SELECTED'); setView('grid'); }}>Revisar seleção</Button><Button primary disabled={busy || !selected.length} onClick={() => setModal('export')}>Exportar seleção ↗</Button></div></header>
      <div className="toolbar"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar pelo nome do arquivo" aria-label="Buscar fotos"/><select aria-label="Ordenação" value={sort} onChange={e => setSort(e.target.value)}><option value="capture">Data da captura</option><option value="name">Nome</option><option value="score">Score ClickIT</option><option value="rating">Estrelas</option><option value="group">Sequências</option></select><Button disabled={busy} onClick={() => { void run(async () => { await window.clickit.index(projectId); await refresh(); }); }}>Atualizar pasta</Button><Button primary disabled={busy || !photos.length} onClick={() => { void run(async () => { await window.clickit.analyze(projectId); await refresh(); }); }}>{project?.status === 'INTERRUPTED' ? 'Continuar análise' : '✦ Analisar fotografias'}</Button></div>
      {progress?.projectId === projectId && <div className="progress-area"><div><span>{progress.stage}</span><span>{progress.done.toLocaleString('pt-BR')} / {progress.total || '…'} {progress.total ? `· ${Math.round(progress.done / progress.total * 100)}%` : ''}{progress.failed > 0 && ` · ${progress.failed} falhas`}</span>{progress.active && <Button onClick={() => { void window.clickit.cancel().catch(e => setError(String(e))); }}>Cancelar</Button>}</div><progress max={progress.total || 1} value={progress.total ? progress.done : undefined}/></div>}
      <div className="filter-row">{FILTERS.map(([id, label]) => <button key={id} className={`filter-chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <div className="workspace"><div className="grid-area">{visible.length ? <PhotoGrid photos={visible} active={active} compared={compared} size={size} focus={setActive} toggle={toggleCompare} open={() => setView('viewer')}/> : <EmptyState title={photos.length ? 'Nenhuma foto neste filtro' : loading ? 'Carregando fotografias' : progress?.projectId === projectId && progress.active ? progress.stage : 'Nenhuma fotografia indexada'}><p>{photos.length ? 'Escolha outro filtro ou altere a busca.' : loading || (progress?.projectId === projectId && progress.active) ? 'Aguarde a leitura da pasta.' : 'Atualize a pasta para identificar as fotografias.'}</p></EmptyState>}</div>{photo ? <Inspector photo={photo} decide={patch => decide(photo.id, patch)} open={() => setView('viewer')}/> : <aside className="inspector inspector-empty"><span>▧</span><p>Escolha uma fotografia<br/>para ver os detalhes.</p></aside>}</div>
      <footer className="library-footer"><span>{visible.length.toLocaleString('pt-BR')} fotos · <b>{selected.length} selecionadas</b> · {photos.filter(p => p.favorite).length} favoritas</span><div className="button-row">{photos.some(p => p.error) && <Button onClick={() => setModal('errors')}>Ver falhas</Button>}<Button onClick={compare}>Comparar {compared.length ? `(${compared.length})` : ''} <kbd>C</kbd></Button><label className="grid-size">Grade <input type="range" min={170} max={340} step={10} value={size} onChange={e => setSize(Number(e.target.value))}/></label></div></footer>
    </>}
    </main>
    {view !== 'grid' && (view === 'compare' || photo) && <PhotoViewer photos={view === 'compare' ? compared.map(id => photos.find(p => p.id === id)).filter((p): p is Photo => !!p) : [photo!]} compare={view === 'compare'} close={() => setView('grid')} decide={decide}/>}
    {modal === 'create' && <Modal title="Novo projeto" close={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); void run(async () => { const p = await window.clickit.create(name); if (!p) return; setModal(null); setName(''); selectProject(p.id); await window.clickit.index(p.id); await refresh(); }); }}><label>Nome do projeto<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Casamento Ana & Pedro"/></label><p className="muted">Escolha a pasta onde estão os originais. Eles serão preservados.</p><Button primary disabled={busy || !name.trim()} type="submit">Selecionar pasta →</Button></form></Modal>}
    {modal === 'settings' && <Modal title="Configurações" close={() => setModal(null)}><p>{system?.cpu}<br/>{system?.cores} núcleos lógicos · {system?.ramGB} GB RAM</p><p className="muted">Recomendação: {system?.recommendedWorkers} worker(s). Cada worker usa um thread de inferência.</p><label>Modo de processamento<select value={settings.mode} onChange={e => setSettings(s => ({ ...s, mode: e.target.value as Settings['mode'] }))}><option value="AUTO">Automático</option><option value="ECO">Econômico</option><option value="BALANCED">Balanceado</option><option value="PERFORMANCE">Desempenho</option></select></label><label>Workers (máximo seguro aplicado automaticamente)<input type="number" min={1} max={4} value={settings.concurrency} onChange={e => setSettings(s => ({ ...s, concurrency: Number(e.target.value) }))}/></label><div className="insight"><p>Similaridade ONNX: {system?.embeddingModel ? 'Instalada' : 'Modelo ausente'}</p><p>Rostos e olhos: {system?.faceModel ? 'Instalado' : 'Modelo ausente'}</p><small>ClickIT {system?.version} · processamento inteiramente local</small></div><Button primary onClick={() => { void run(async () => { setSettings(await window.clickit.settings(settings)); setModal(null); }); }}>Salvar configuração</Button></Modal>}
    {modal === 'export' && projectId && <Modal title="Exportar seleção" close={() => setModal(null)}><h3>{selected.length} fotografias · {(totalBytes / 1024 ** 3).toFixed(2)} GB</h3><p>Copie os arquivos originais selecionados ou salve uma lista JSON com caminhos, estrelas e favoritas.</p><p className="muted">As cópias recebem um sufixo único para evitar colisões de nomes.</p><div className="button-row">{(['COPY', 'LIST'] as const).map(mode => <Button key={mode} primary={mode === 'COPY'} disabled={busy} onClick={() => { setModal(null); void run(async () => { const result = await window.clickit.export(projectId, mode); setNotice(`${result.cancelled ? 'Exportação interrompida' : 'Exportação concluída'}: ${result.copied}/${result.total} arquivos. ${result.errors.join(' · ')}`); }); }}>{mode === 'COPY' ? 'Copiar originais' : 'Criar lista'}</Button>)}</div></Modal>}
    {modal === 'errors' && <Modal title="Arquivos que precisam de atenção" close={() => setModal(null)}><div className="errors-list">{photos.filter(p => p.error).map(p => <p key={p.id}><strong>{p.fileName}</strong><br/>{p.error}</p>)}</div></Modal>}
  </div>;
}
