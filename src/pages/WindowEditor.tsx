import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { calcWindow } from '../engine/calc';
import { computeGeometry, PRESETS } from '../engine/geometry';
import { glassSize } from '../engine/calc';
import { Drawing2D } from '../components/Drawing2D';
import { Window3D } from '../components/Window3D';
import { CalcBreakdown, CostTable } from '../components/CalcBreakdown';
import { Field, NumInput, Tabs, Warnings, confirmDo } from '../components/ui';
import { OPEN_LABELS, OpenType, PRICE_METHOD_LABELS, PriceMethod, WindowItem, Layout } from '../types';
import type { Catalog } from '../lib/data';

export function defaultWindow(projectId: number, cat: Catalog, order: number): WindowItem {
  const preset = PRESETS.find((p) => p.key === 'tilt-turn')!;
  return {
    projectId, name: `Poz. ${order + 1}`, kind: preset.name, width: 1000, height: 1200, qty: 1,
    systemId: cat.systems[0]?.id ?? '', glassId: cat.glassTypes.find((g) => g.id === 'g-double')?.id ?? cat.glassTypes[0]?.id ?? '',
    cellGlass: {}, color: cat.colors[0]?.name ?? '', layout: JSON.parse(JSON.stringify(preset.layout)),
    pricing: { method: 'm2', unitPrice: 0, manualTotal: 0, marginPct: 20 },
    laborIds: cat.laborRates.filter((l) => l.defaultOn).map((l) => l.id), extras: [], lineOff: {}, extraPieces: [],
    accQty: {}, notes: '', order
  };
}

const OPEN_KEYS = Object.keys(OPEN_LABELS) as OpenType[];

function LayoutEditor({
  layout, onChange, glassOpts, cellGlass, onCellGlass, defaultGlass
}: {
  layout: Layout;
  onChange: (l: Layout) => void;
  glassOpts: { id: string; name: string }[];
  cellGlass: Record<string, string>;
  onCellGlass: (g: Record<string, string>) => void;
  defaultGlass: string;
}) {
  const set = (fn: (l: Layout) => void) => {
    const c: Layout = JSON.parse(JSON.stringify(layout));
    fn(c);
    onChange(c);
  };
  return (
    <div>
      {layout.columns.map((col, ci) => (
        <div key={ci} className="card" style={{ padding: 10 }}>
          <div className="row sp">
            <b>Kolona {ci + 1}</b>
            <div className="row">
              <div style={{ width: 130 }}>
                <NumInput value={col.w} allowEmpty min={0} placeholder="auto (mm)" onChange={(v) => set((l) => (l.columns[ci].w = v > 0 ? v : undefined))} />
              </div>
              <button className="btn sm danger" disabled={layout.columns.length <= 1} onClick={() => set((l) => l.columns.splice(ci, 1))}>
                Hiq kolonën
              </button>
            </div>
          </div>
          <div className="hint">Gjerësia e hapjes në mm (bosh = automatike)</div>
          {col.cells.map((cell, ri) => {
            const key = `${ci + 1}-${ri + 1}`;
            return (
              <div key={ri} className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
                <div style={{ minWidth: 40 }} className="mono">{key}</div>
                <div className="grow" style={{ minWidth: 190 }}>
                  <Field label="Hapja">
                    <select value={cell.open} onChange={(e) => set((l) => (l.columns[ci].cells[ri].open = e.target.value as OpenType))}>
                      {OPEN_KEYS.map((k) => (
                        <option key={k} value={k}>{OPEN_LABELS[k]}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {col.cells.length > 1 && (
                  <div style={{ width: 110 }}>
                    <Field label="Lartësia mm">
                      <NumInput value={cell.h} allowEmpty min={0} placeholder="auto" onChange={(v) => set((l) => (l.columns[ci].cells[ri].h = v > 0 ? v : undefined))} />
                    </Field>
                  </div>
                )}
                <div style={{ minWidth: 150 }}>
                  <Field label="Qelqi i kësaj pjese">
                    <select
                      value={cellGlass[key] ?? ''}
                      onChange={(e) => {
                        const n = { ...cellGlass };
                        if (e.target.value) n[key] = e.target.value;
                        else delete n[key];
                        onCellGlass(n);
                      }}
                    >
                      <option value="">Si dritarja ({glassOpts.find((g) => g.id === defaultGlass)?.name ?? '-'})</option>
                      {glassOpts.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <button className="btn sm danger" disabled={col.cells.length <= 1} onClick={() => set((l) => l.columns[ci].cells.splice(ri, 1))}>✕</button>
              </div>
            );
          })}
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => set((l) => l.columns[ci].cells.push({ open: 'fixed' }))}>
            + Pjesë poshtë (ndarje horizontale)
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => set((l) => l.columns.push({ cells: [{ open: 'fixed' }] }))}>+ Shto kolonë</button>
    </div>
  );
}

export default function WindowEditor() {
  const { pid, wid } = useParams();
  const nav = useNavigate();
  const cat = useCatalog();
  const projectId = Number(pid);
  const [w, setW] = useState<WindowItem | null>(null);
  const [tab, setTab] = useState<'cfg' | '3d' | 'calc' | 'price'>('cfg');
  const [saved, setSaved] = useState(true);
  const templates = useLiveQuery(() => db.templates.toArray(), []) ?? [];
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const loaded = useRef(false);

  useEffect(() => {
    if (!cat.ready || loaded.current) return;
    loaded.current = true;
    (async () => {
      if (wid === 'new') {
        const count = await db.windows.where('projectId').equals(projectId).count();
        const d = defaultWindow(projectId, cat, count);
        const id = await db.windows.add(d);
        nav(`/projects/${projectId}/window/${id}`, { replace: true });
        setW({ ...d, id });
      } else {
        const x = await db.windows.get(Number(wid));
        if (x) setW(x);
      }
    })();
  }, [cat.ready, wid, projectId]); // eslint-disable-line

  // autosave
  const firstRun = useRef(true);
  const latest = useRef<WindowItem | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (!w?.id) return;
    latest.current = w;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    dirty.current = true;
    setSaved(false);
    const t = setTimeout(async () => {
      await db.windows.put(w);
      dirty.current = false;
      setSaved(true);
    }, 350);
    return () => clearTimeout(t);
  }, [w]);
  // flush pending edits when leaving the page
  useEffect(() => () => {
    if (dirty.current && latest.current) db.windows.put(latest.current);
  }, []);

  const patch = (p: Partial<WindowItem>) => setW((cur) => (cur ? { ...cur, ...p } : cur));
  const sys = w ? cat.ctx.systems.get(w.systemId) : undefined;
  const calc = useMemo(() => (w && cat.ready ? calcWindow(w, cat.ctx) : null), [w, cat.ctx, cat.ready]);
  const glassLabels = useMemo(() => {
    const out: Record<string, string> = {};
    if (!w || !sys) return out;
    for (const c of computeGeometry(w.width, w.height, w.layout, sys.params).cells) {
      try {
        const g = glassSize(sys, c, w.width, w.height);
        out[c.key] = `${g.gw}×${g.gh}`;
      } catch { /* shown in errors */ }
    }
    return out;
  }, [w, sys]);

  if (!cat.ready || !w || !calc) return <div className="empty">Duke ngarkuar…</div>;
  const colorHex = cat.colors.find((c) => c.name === w.color)?.hex ?? '#f4f4f2';
  const glass = cat.ctx.glass.get(w.glassId);
  const sym = cat.currency.symbol;
  const sizeInvalid = !(w.width >= 200 && w.height >= 200);

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (p) patch({ layout: JSON.parse(JSON.stringify(p.layout)), kind: p.name, cellGlass: {}, lineOff: {} });
    const t = templates.find((x) => `t${x.id}` === key);
    if (t) patch({ layout: JSON.parse(JSON.stringify(t.layout)), kind: t.name, cellGlass: {}, lineOff: {} });
  };

  const sameProject = (
    <Link to={`/projects/${projectId}`} className="btn sm">← {project?.name ?? 'Projekti'}</Link>
  );

  return (
    <div>
      <div className="row sp" style={{ marginBottom: 10 }}>
        <div className="row">
          {sameProject}
          <h1 style={{ margin: 0 }}>{w.name || 'Dritare'}</h1>
          <span className={'tag ' + (saved ? 'ok' : 'gold')}>{saved ? 'U ruajt' : 'Duke ruajtur…'}</span>
        </div>
        <div className="row">
          <b>{sizeInvalid ? '' : `${w.width} × ${w.height} mm`}</b>
          <span className="tag gold">{(calc.area * w.qty).toFixed(2)} m²</span>
        </div>
      </div>
      <Tabs
        tabs={[
          { key: 'cfg', label: 'Konfigurimi + 2D' },
          { key: '3d', label: '3D' },
          { key: 'calc', label: 'Llogaritja teknike' },
          { key: 'price', label: 'Kostoja dhe çmimi' }
        ]}
        value={tab}
        onChange={setTab}
      />
      {sizeInvalid && <div className="alert err">Përmasat duhet të jenë të paktën 200 mm (gjerësi dhe lartësi).</div>}
      {sys && !sys.verified && (
        <div className="alert warn">
          Sistemi “{sys.name}” ka recetë/zbritje të pa verifikuara (vlera fillestare 0). Plotësoji te Materialet → Sisteme para se të nxjerrësh ofertë.
        </div>
      )}
      <Warnings errors={calc.errors} warnings={calc.warnings} />

      {tab === 'cfg' && (
        <div className="split">
          <div>
            <div className="card">
              <div className="grid g2">
                <Field label="Gjerësia (mm)"><NumInput value={w.width} min={0} onChange={(v) => patch({ width: v })} /></Field>
                <Field label="Lartësia (mm)"><NumInput value={w.height} min={0} onChange={(v) => patch({ height: v })} /></Field>
                <Field label="Prodhuesi / sistemi">
                  <select value={w.systemId} onChange={(e) => patch({ systemId: e.target.value, lineOff: {}, extraPieces: [] })}>
                    {cat.systems.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.material === 'pvc' ? 'PVC' : 'Alumin'})</option>)}
                  </select>
                </Field>
                <Field label="Modeli i hapjes">
                  <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
                    <option value="">{w.kind} (ndrysho…)</option>
                    <optgroup label="Standarde">
                      {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                    </optgroup>
                    {templates.length > 0 && (
                      <optgroup label="Të personalizuara">
                        {templates.map((t) => <option key={t.id} value={`t${t.id}`}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </Field>
                <Field label="Ngjyra">
                  <select value={w.color} onChange={(e) => patch({ color: e.target.value })}>
                    {cat.colors.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Sasia (copë)"><NumInput value={w.qty} min={1} step={1} onChange={(v) => patch({ qty: Math.max(1, Math.floor(v)) })} /></Field>
              </div>
            </div>
            <details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Opsione të avancuara (emri, qelqi, shënime, ndarja e dritares)</summary>
              <div className="grid g2" style={{ marginTop: 10 }}>
                <Field label="Pozicioni / emri"><input value={w.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
                <Field label="Lloji i qelqit">
                  <select value={w.glassId} onChange={(e) => patch({ glassId: e.target.value })}>
                    {cat.glassTypes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Shënime"><textarea value={w.notes} onChange={(e) => patch({ notes: e.target.value })} /></Field>
            </details>
            <details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Ndarja e dritares (për konfigurime të veçanta)</summary>
              <div className="row sp" style={{ marginTop: 10 }}>
                <h2 style={{ margin: 0 }}>Ndarja e dritares</h2>
                <button
                  className="btn sm"
                  onClick={async () => {
                    const name = window.prompt('Emri i konfigurimit të personalizuar:', w.kind);
                    if (name) {
                      await db.templates.add({ name, layout: JSON.parse(JSON.stringify(w.layout)) });
                      alert('Konfigurimi u ruajt. Do ta gjesh te “Të personalizuara”.');
                    }
                  }}
                >
                  Ruaj si konfigurim të ri
                </button>
              </div>
              <LayoutEditor
                layout={w.layout}
                onChange={(l) => patch({ layout: l, kind: 'Konfigurim i personalizuar' })}
                glassOpts={cat.glassTypes}
                cellGlass={w.cellGlass}
                onCellGlass={(g) => patch({ cellGlass: g })}
                defaultGlass={w.glassId}
              />
              {templates.length > 0 && (
                <div className="pill-row" style={{ marginTop: 10 }}>
                  {templates.map((t) => (
                    <button key={t.id} className="btn sm danger" onClick={async () => confirmDo(`Fshi konfigurimin “${t.name}”?`) && db.templates.delete(t.id!)}>
                      ✕ {t.name}
                    </button>
                  ))}
                </div>
              )}
            </details>
          </div>
          <div style={{ position: 'sticky', top: 8 }}>
            <div className="card">
              <h2>Vizatimi teknik 2D</h2>
              {sys && !sizeInvalid ? (
                <Drawing2D W={w.width} H={w.height} layout={w.layout} params={sys.params} colorHex={colorHex} glassLabels={glassLabels} showKeys />
              ) : (
                <div className="empty">Zgjidh sistemin dhe përmasat.</div>
              )}
              <div className="hint" style={{ marginTop: 6 }}>
                Vizatimi gjenerohet nga përmasat dhe konfigurimi real. Dimensionet e brendshme tregojnë gjerësinë e hapjes; numrat në qelq janë përmasat e qelqit të llogaritura. Simbolet e kuqe tregojnë drejtimin e hapjes (kulmi i trekëndëshit = ana e menteshave).
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === '3d' && sys && !sizeInvalid && (
        <div className="card">
          <Window3D W={w.width} H={w.height} layout={w.layout} params={sys.params} colorHex={colorHex} glassThickness={glass?.thickness ?? 24} />
          <div className="hint" style={{ marginTop: 6 }}>
            Tërhiq për ta rrotulluar, shtrëngo/rrota për zoom. Thellësia e kasës dhe e kanatit merren nga parametrat e sistemit (frameDepth, sashDepth); trashësia e qelqit nga lloji i qelqit.
          </div>
        </div>
      )}

      {tab === 'calc' && (
        <div className="card">
          <CalcBreakdown calc={calc} ctx={cat.ctx} w={w} onPatch={patch} sym={sym} />
          <h3 style={{ marginTop: 14 }}>Pjesë shtesë manuale (korrigjim)</h3>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Profili</th><th>Përshkrimi</th><th>Gjatësia mm</th><th>Copë</th><th /></tr></thead>
              <tbody>
                {w.extraPieces.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <select value={p.profileId} onChange={(e) => patch({ extraPieces: w.extraPieces.map((x, j) => (j === i ? { ...x, profileId: e.target.value } : x)) })}>
                        {cat.profiles.filter((x) => x.systemId === w.systemId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td><input value={p.label} onChange={(e) => patch({ extraPieces: w.extraPieces.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></td>
                    <td><NumInput value={p.length} min={0} onChange={(v) => patch({ extraPieces: w.extraPieces.map((x, j) => (j === i ? { ...x, length: v } : x)) })} /></td>
                    <td><NumInput value={p.qty} min={0} step={1} onChange={(v) => patch({ extraPieces: w.extraPieces.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} /></td>
                    <td><button className="btn sm danger" onClick={() => patch({ extraPieces: w.extraPieces.filter((_, j) => j !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn sm"
            style={{ marginTop: 8 }}
            onClick={() => {
              const first = cat.profiles.find((x) => x.systemId === w.systemId);
              if (first) patch({ extraPieces: [...w.extraPieces, { profileId: first.id, length: 500, qty: 1, label: 'Shtesë manuale' }] });
            }}
          >
            + Shto pjesë
          </button>
        </div>
      )}

      {tab === 'price' && (
        <div className="split">
          <div className="card">
            <h2>Metoda e çmimit të shitjes</h2>
            <Field label="Metoda">
              <select value={w.pricing.method} onChange={(e) => patch({ pricing: { ...w.pricing, method: e.target.value as PriceMethod } })}>
                {(Object.keys(PRICE_METHOD_LABELS) as PriceMethod[]).map((k) => <option key={k} value={k}>{PRICE_METHOD_LABELS[k]}</option>)}
              </select>
            </Field>
            <div className="grid g2" style={{ marginTop: 10 }}>
              {['m2', 'ml', 'unit'].includes(w.pricing.method) && (
                <Field label={`Çmimi (${sym} ${w.pricing.method === 'm2' ? '/ m²' : w.pricing.method === 'ml' ? '/ ml' : '/ copë'})`}>
                  <NumInput value={w.pricing.unitPrice} min={0} onChange={(v) => patch({ pricing: { ...w.pricing, unitPrice: v } })} />
                </Field>
              )}
              {w.pricing.method === 'manual' && (
                <Field label={`Çmimi total (${sym})`}>
                  <NumInput value={w.pricing.manualTotal} min={0} onChange={(v) => patch({ pricing: { ...w.pricing, manualTotal: v } })} />
                </Field>
              )}
              {['margin', 'sellList'].includes(w.pricing.method) && (
                <Field label={w.pricing.method === 'margin' ? 'Marzh mbi koston (%)' : 'Marzh mbi punën dhe shpenzimet (%)'}>
                  <NumInput value={w.pricing.marginPct} min={0} onChange={(v) => patch({ pricing: { ...w.pricing, marginPct: v } })} />
                </Field>
              )}
            </div>
            <h3 style={{ marginTop: 14 }}>Punë krahu</h3>
            {cat.laborRates.length === 0 && <div className="muted small">Nuk ka tarifa pune. Shtoji te Cilësimet.</div>}
            {cat.laborRates.map((l) => (
              <label key={l.id} className="chk">
                <input
                  type="checkbox"
                  checked={w.laborIds.includes(l.id)}
                  onChange={(e) => patch({ laborIds: e.target.checked ? [...w.laborIds, l.id] : w.laborIds.filter((x) => x !== l.id) })}
                />
                {l.name} <span className="muted small">({l.rate} {sym} / {l.unit === 'm2' ? 'm²' : l.unit === 'ml' ? 'ml' : 'copë'})</span>
              </label>
            ))}
            <h3 style={{ marginTop: 14 }}>Shpenzime të tjera (për 1 copë)</h3>
            {w.extras.map((x, i) => (
              <div key={i} className="row" style={{ marginBottom: 6 }}>
                <input style={{ flex: 2, minWidth: 120 }} placeholder="Përshkrimi" value={x.label} onChange={(e) => patch({ extras: w.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                <div style={{ width: 100 }}><NumInput value={x.cost} min={0} placeholder="Kosto" onChange={(v) => patch({ extras: w.extras.map((y, j) => (j === i ? { ...y, cost: v } : y)) })} /></div>
                <div style={{ width: 100 }}><NumInput value={x.price} min={0} placeholder="Çmim" onChange={(v) => patch({ extras: w.extras.map((y, j) => (j === i ? { ...y, price: v } : y)) })} /></div>
                <button className="btn sm danger" onClick={() => patch({ extras: w.extras.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn sm" onClick={() => patch({ extras: [...w.extras, { label: '', cost: 0, price: 0 }] })}>+ Shto shpenzim</button>
            <div className="hint">Kosto hyn te shpenzimet; “Çmim” i shtohet çmimit të shitjes (përveç metodës manuale).</div>
          </div>
          <div className="card">
            <h2>Kostoja dhe fitimi (sasia {w.qty})</h2>
            <CostTable calc={calc} sym={sym} />
          </div>
        </div>
      )}
    </div>
  );
}
