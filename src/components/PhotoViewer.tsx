import { previewEvent } from '../renderer/diagnostics.ts';
import { useEffect, useState } from 'react';
import type { Photo, DecisionPatch } from '../types/domain.ts';
import { asset } from '../features/photos.ts';
import { Button } from './ui.tsx';
export function PhotoViewer({ photos, compare, close, decide }: { photos: Photo[]; compare: boolean; close: () => void; decide: (id: string, patch: DecisionPatch) => void }): React.JSX.Element {
  const [zoom, setZoom] = useState(0), [sync, setSync] = useState(true);
  useEffect(() => { setZoom(0); }, [photos[0]?.id]);
  return <section className="viewer" aria-label={compare ? 'Comparação' : 'Visualização individual'}>
    <header><strong>{compare ? `Comparar · ${photos.length} fotografias` : photos[0]?.fileName}</strong><div className="button-row"><label>Zoom <select value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0}>Ajustar</option>{[25, 50, 100, 200].map(z => <option key={z} value={z}>{z === 100 ? '1:1 · 100%' : `${z}%`}</option>)}</select></label>{compare && <label><input type="checkbox" checked={sync} onChange={e => setSync(e.target.checked)}/> Pan sincronizado</label>}<Button onClick={close}>Voltar à grade <kbd>G</kbd></Button></div></header>
    <div className="viewer-grid" style={{ gridTemplateColumns: `repeat(${compare ? Math.min(3, photos.length) : 1},minmax(0,1fr))` }}>
      {photos.map(p => {
        const raw = !['.jpg', '.jpeg', '.png'].includes(p.extension);
        return <article className="viewer-photo" key={p.id}><div className={`zoom-pane ${zoom ? 'pixel' : ''}`} onScroll={e => {
          if (!compare || !sync) return;
          const target = e.currentTarget, left = target.scrollLeft / Math.max(1, target.scrollWidth - target.clientWidth), top = target.scrollTop / Math.max(1, target.scrollHeight - target.clientHeight);
          target.parentElement?.parentElement?.querySelectorAll<HTMLDivElement>('.zoom-pane').forEach(node => { if (node !== target) { const x = left * (node.scrollWidth - node.clientWidth), y = top * (node.scrollHeight - node.clientHeight); if (Math.abs(node.scrollLeft - x) > 2) node.scrollLeft = x; if (Math.abs(node.scrollTop - y) > 2) node.scrollTop = y; } });
        }} onPointerDown={e => { if (!zoom || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.drag = 'yes'; }} onPointerUp={e => { delete e.currentTarget.dataset.drag; }} onPointerMove={e => { if (e.currentTarget.dataset.drag) { e.currentTarget.scrollLeft -= e.movementX; e.currentTarget.scrollTop -= e.movementY; } }}>
          <img onLoad={e => previewEvent('PREVIEW_RENDERED', p, e.currentTarget)} onError={e => previewEvent('PREVIEW_FAILED', p, e.currentTarget)} draggable={false} src={asset(p, zoom && !raw ? 'original' : 'preview')} alt={p.fileName} style={zoom ? { width: `${p.width * zoom / 100}px`, maxWidth: 'none', maxHeight: 'none' } : {}}/>
        </div><div className="viewer-info"><div><strong>{p.fileName}</strong>{p.rank === 1 && <span className="accent"> ✦ ClickIT Pick</span>}<p>Foco {Math.round(p.analysis?.faceScore ?? p.analysis?.regionalSharpness ?? 0)} · Score {p.analysis?.overall ?? '—'} · {p.analysis?.faces.some(f => f.eyes === 'CLOSED') ? 'Possivelmente olhos fechados' : 'Confira a expressão'}{raw && ' · Zoom do preview RAW, não do sensor'}</p></div><div className="button-row"><Button primary onClick={() => decide(p.id, { status: 'SELECTED' })}>Selecionar</Button><Button onClick={() => decide(p.id, { status: 'REVIEW' })}>Revisar</Button></div></div></article>;
      })}
    </div><footer>← → navegar · A selecionar · R revisar · X rejeitar · F favorita · 0–5 estrelas · arraste para deslocar a imagem ampliada</footer>
  </section>;
}
