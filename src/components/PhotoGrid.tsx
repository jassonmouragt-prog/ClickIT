import { previewEvent } from '../renderer/diagnostics.ts';
import { useEffect, useRef, useState } from 'react';
import type { Photo } from '../types/domain.ts';
import { asset, isSelected } from '../features/photos.ts';
interface Props { photos: Photo[]; active: string | null; compared: string[]; size: number; focus: (id: string) => void; toggle: (id: string) => void; open: () => void }
export function PhotoGrid({ photos, active, compared, size, focus, toggle, open }: Props): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null), [viewport, setViewport] = useState({ width: 900, height: 700, top: 0 });
  const columns = Math.max(1, Math.floor(viewport.width / size)), rowHeight = Math.round(size * 0.78), rows = Math.ceil(photos.length / columns);
  const top = Math.min(viewport.top, Math.max(0, rows * rowHeight - viewport.height));
  const start = Math.max(0, Math.floor(top / rowHeight) - 2), end = Math.min(rows, Math.ceil((top + viewport.height) / rowHeight) + 2);
  useEffect(() => {
    const node = root.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setViewport(v => ({ ...v, width: entry.contentRect.width, height: entry.contentRect.height })); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const index = photos.findIndex(p => p.id === active), node = root.current;
    if (index < 0 || !node) return;
    const top = Math.floor(index / columns) * rowHeight;
    if (top < node.scrollTop || top + rowHeight > node.scrollTop + node.clientHeight) node.scrollTop = Math.max(0, top - rowHeight);
  }, [active, columns, rowHeight, photos]);
  return <div className="photo-grid-scroll" ref={root} onScroll={e => { const top = e.currentTarget.scrollTop; setViewport(v => ({ ...v, top })); }} aria-label="Fotografias">
    <div style={{ height: rows * rowHeight, position: 'relative' }}>
      <div className="photo-grid" style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: rowHeight }}>
        {photos.slice(start * columns, end * columns).map(p => <div key={p.id} className={`photo-card ${active === p.id ? 'active' : ''} ${p.decision === 'REJECTED' ? 'rejected' : ''}`}>
          <button className="photo-image" onClick={() => focus(p.id)} onDoubleClick={open} aria-label={`Abrir ${p.fileName}`}>
            {p.thumbnailPath ? <img onLoad={e => previewEvent('PREVIEW_RENDERED', p, e.currentTarget)} onError={e => previewEvent('PREVIEW_FAILED', p, e.currentTarget)} loading="lazy" src={asset(p, 'thumbnail')} alt={p.fileName}/> : <span className="placeholder">{p.error || p.analysisStatus === 'FAILED' ? 'Não foi possível ler' : 'Aguardando preview'}</span>}
            {p.rank === 1 && <span className="pick">✦ ClickIT Pick</span>}
            {isSelected(p) && <span className="selection-check">✓</span>}
          </button>
          <div className="photo-caption"><span title={p.fileName}>{p.fileName}</span><span className={p.decision === 'REVIEW' ? 'amber' : ''}>{p.favorite ? '♥ ' : ''}{p.rating ? '★'.repeat(p.rating) : p.decision === 'REVIEW' ? 'Revisar' : ''}</span></div>
          <label className="compare-check" title="Adicionar à comparação"><input type="checkbox" checked={compared.includes(p.id)} onChange={() => toggle(p.id)} aria-label={`Comparar ${p.fileName}`}/></label>
        </div>)}
      </div>
    </div>
  </div>;
}
