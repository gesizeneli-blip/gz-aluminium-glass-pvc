import { useMemo, useState } from 'react';
import { PANELS, PANEL_SERIES, panelUrl, type PanelSeries } from '../data/panels';
import type { PanelChoice } from '../types';

export function PanelPicker({ value, onChange }: { value?: PanelChoice; onChange: (p?: PanelChoice) => void }) {
  const [open, setOpen] = useState(!value);
  const [q, setQ] = useState('');
  const [series, setSeries] = useState<PanelSeries | 'all'>('all');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, '');
    return PANELS.filter((p) => (series === 'all' || p.series === series) && (!t || p.code.toLowerCase().replace(/\s+/g, '').includes(t)));
  }, [q, series]);

  return (
    <div className="card">
      <div className="row sp" style={{ marginBottom: 6 }}>
        <b>Paneli i derës</b>
        {value && <button className="btn sm" onClick={() => setOpen((o) => !o)}>{open ? 'Mbyll listën' : 'Ndërro panelin'}</button>}
      </div>
      {value && (
        <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
          <img src={panelUrl(value.file)} alt={value.code} style={{ height: 96, borderRadius: 4 }} />
          <div>
            <b>{value.code}</b>
            <div className="small muted">{PANEL_SERIES[value.series]}{value.combo ? ' · me anësor' : ''}</div>
            <button className="btn sm danger" style={{ marginTop: 6 }} onClick={() => onChange(undefined)}>Hiq panelin</button>
          </div>
        </div>
      )}
      {open && (
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <input placeholder="Kërko kodin (p.sh. 906)" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
            <select value={series} onChange={(e) => setSeries(e.target.value as PanelSeries | 'all')} style={{ maxWidth: 200 }}>
              <option value="all">Të gjitha seritë</option>
              {(Object.keys(PANEL_SERIES) as PanelSeries[]).map((k) => <option key={k} value={k}>{PANEL_SERIES[k]}</option>)}
            </select>
            <span className="small muted">{list.length} modele</span>
          </div>
          <div className="panel-grid">
            {list.map((p) => (
              <button
                key={p.file}
                className={'panel-item' + (value?.file === p.file ? ' on' : '')}
                onClick={() => { onChange({ code: p.code, file: p.file, series: p.series, combo: p.combo }); setOpen(false); }}
              >
                <img src={panelUrl(p.file)} alt={p.code} loading="lazy" />
                <span>{p.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
