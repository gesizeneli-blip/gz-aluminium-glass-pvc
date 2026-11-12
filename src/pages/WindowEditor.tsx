import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { calcWindow } from '../engine/calc';
import { computeGeometry, PRESETS, presetsFor, buildMulti, suggestSashCount, MULTI_BY_MODE, MAX_SASHES } from '../engine/geometry';
import { GROUP_ORDER } from '../db/seed';
import { PanelPicker } from '../components/PanelPicker';
import { Drawing2D } from '../components/Drawing2D';
import { Window3D } from '../components/Window3D';
import { CalcBreakdown, CostTable } from '../components/CalcBreakdown';
import { Field, NumInput, Tabs, Warnings, confirmDo } from '../components/ui';
import { OPEN_LABELS, DEFAULT_SHUTTER, DEFAULT_TRIM, OpenType, PRICE_METHOD_LABELS, PriceMethod, WindowItem, Layout, SHAPE_LABELS, ShapeType, SHUTTER_KINDS, SHUTTER_KIND_LABELS, SHUTTER_ONLY_ID, ShutterKind } from '../types';
import { isShaped, normalizeShape } from '../engine/shapes';
import type { Catalog } from '../lib/data';

export function defaultWindow(projectId: number, cat: Catalog, order: number): WindowItem {
  const preset = PRESETS.find((p) => p.key === 'tilt-turn')!;
  return {
    projectId, name: `Poz. ${order + 1}`, kind: preset.name, width: 1000, height: 1200, qty: 1,
    systemId: (cat.systems.find((x) => x.id === 'alu-open') ?? cat.systems[0])?.id ?? '', glassId: cat.glassTypes.find((g) => g.id === 'g-double')?.id ?? cat.glassTypes[0]?.id ?? '',
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
  const tKey = 'T';
  return (
    <div>
      <div className="card" style={{ padding: 10 }}>
        <label className="chk">
          <input
            type="checkbox"
            checked={!!layout.transom}
            onChange={(e) => set((l) => { l.transom = e.target.checked ? { h: 300, open: 'fixed' } : undefined; })}
          /> Pjesë e sipërme e plotë (tranzom) mbi të gjitha kolonat
        </label>
        {layout.transom && (
          <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <div style={{ width: 130 }}>
              <Field label="Lartësia mm">
                <NumInput value={layout.transom.h} min={50} onChange={(v) => set((l) => { l.transom!.h = v; })} />
              </Field>
            </div>
            <div className="grow" style={{ minWidth: 190 }}>
              <Field label="Hapja">
                <select value={layout.transom.open} onChange={(e) => set((l) => { l.transom!.open = e.target.value as OpenType; })}>
                  {OPEN_KEYS.map((k) => <option key={k} value={k}>{OPEN_LABELS[k]}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ minWidth: 150 }}>
              <Field label="Qelqi i kësaj pjese">
                <select
                  value={cellGlass[tKey] ?? ''}
                  onChange={(e) => {
                    const n = { ...cellGlass };
                    if (e.target.value) n[tKey] = e.target.value; else delete n[tKey];
                    onCellGlass(n);
                  }}
                >
                  <option value="">Si dritarja ({glassOpts.find((g) => g.id === defaultGlass)?.name ?? '-'})</option>
                  {glassOpts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </div>
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
  const [lowered, setLowered] = useState(0.3);
  const [sel, setSel] = useState('');
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
    (calc?.glass ?? []).forEach((g) => (out[g.cell] = `${g.w}×${g.h}`));
    return out;
  }, [calc]);

  if (!cat.ready || !w || !calc) return <div className="empty">Duke ngarkuar…</div>;
  const colorHex = cat.colors.find((c) => c.name === w.color)?.hex ?? '#f4f4f2';
  const glass = cat.ctx.glass.get(w.glassId);
  const fillsHex: Record<string, string> = {};
  Object.entries(w.fills ?? {}).forEach(([k, f]) => { fillsHex[k] = (f.color && cat.colors.find((c) => c.name === f.color)?.hex) || colorHex; });
  const selValid = sel && (sel === 'T' || sel === '1-1' || w.layout.columns.some((col, ci) => col.cells.some((_, ri) => `${ci + 1}-${ri + 1}` === sel)));
  const setFill = (key: string, on: boolean, color?: string) => {
    const f = { ...(w.fills ?? {}) };
    if (on) f[key] = color ? { color } : {}; else delete f[key];
    patch({ fills: f });
  };
  const sym = cat.currency.symbol;
  const sizeInvalid = !(w.width >= 200 && w.height >= 200);

  const groupedSystems = (() => {
    const m = new Map<string, typeof cat.systems>();
    cat.systems.forEach((x) => { const g = x.group ?? 'Të tjerë'; m.set(g, [...(m.get(g) ?? []), x]); });
    const ord = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
    return [...m.entries()].sort((a, b) => ord(a[0]) - ord(b[0]));
  })();

  const changeSystem = (id: string) => {
    const ns = cat.ctx.systems.get(id);
    const p: Partial<WindowItem> = { systemId: id, lineOff: {}, extraPieces: [] };
    if (id === SHUTTER_ONLY_ID) {
      p.shutter = { ...DEFAULT_SHUTTER, ...(w.shutter ?? {}), enabled: true, only: true, kind: w.shutter?.kind ?? 'alu', motor: w.shutter?.motor ?? false };
      p.kind = SHUTTER_KIND_LABELS[p.shutter.kind ?? 'alu'];
      p.pricing = { ...w.pricing, method: 'm2', unitPrice: 0 };
      p.nets = {}; p.fills = {}; p.trims = undefined; p.panel = undefined; p.shape = undefined;
      p.layout = JSON.parse(JSON.stringify(presetsFor('fixed')[0].layout));
    } else if (w.shutter?.only) {
      p.shutter = { ...w.shutter, only: false, enabled: false, kind: undefined };
      p.kind = presetsFor(ns?.mode)[0]?.name ?? w.kind;
      if (presetsFor(ns?.mode)[0]) p.layout = JSON.parse(JSON.stringify(presetsFor(ns?.mode)[0].layout));
    }
    if (ns?.defaultGlassId && cat.ctx.glass.has(ns.defaultGlassId)) { p.glassId = ns.defaultGlassId; p.cellGlass = {}; }
    // the current layout may not exist for the new system type (e.g. sliding -> bifold): switch to its first model
    const okPresets = presetsFor(ns?.mode);
    if (!okPresets.some((x) => x.name === w.kind)) {
      const first = okPresets[0];
      if (first && ns?.mode !== sys?.mode) {
        const n = ns?.params.maxSashW ? suggestSashCount(w.width, ns.params.maxSashW) : 0;
        const multi = ns?.mode ? MULTI_BY_MODE[ns.mode]?.[0] : undefined;
        if (multi && n > 1) { p.layout = buildMulti(multi.kind, n); p.kind = `${multi.label} (${n})`; }
        else { p.layout = JSON.parse(JSON.stringify(first.layout)); p.kind = first.name; }
        p.shape = undefined;
      }
    }
    patch(p);
  };

  const sOnly = sys?.id === SHUTTER_ONLY_ID;
  const netCells = sOnly ? [] : isShaped(w.shape) ? [] : computeGeometry(w.width, w.height, w.layout, sys?.params ?? {}).cells;
  const multiOpts = sys?.mode ? MULTI_BY_MODE[sys.mode] ?? [] : [];
  const sashSuggest = sys?.params.maxSashW ? suggestSashCount(w.width, sys.params.maxSashW) : 0;
  const applyMulti = (kind: (typeof multiOpts)[number], n: number) =>
    patch({ layout: buildMulti(kind.kind, n), kind: `${kind.label} (${n})`, cellGlass: {}, lineOff: {}, shape: undefined });

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (p) patch({ layout: JSON.parse(JSON.stringify(p.layout)), kind: p.name, cellGlass: {}, lineOff: {}, shape: undefined });
    const t = templates.find((x) => `t${x.id}` === key);
    if (t) patch({ layout: JSON.parse(JSON.stringify(t.layout)), kind: t.name, cellGlass: {}, lineOff: {}, shape: undefined });
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
          ...(sOnly ? [] : [{ key: '3d', label: '3D' }]),
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
                  <select value={w.systemId} onChange={(e) => changeSystem(e.target.value)}>
                    {groupedSystems.map(([g, list]) => (
                      <optgroup key={g} label={g}>
                        {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                {!sOnly && (<Field label="Modeli i hapjes">
                  <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
                    <option value="">{w.kind} (ndrysho…)</option>
                    <optgroup label="Standarde">
                      {presetsFor(sys?.mode).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                    </optgroup>
                    {templates.length > 0 && (
                      <optgroup label="Të personalizuara">
                        {templates.map((t) => <option key={t.id} value={`t${t.id}`}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </Field>)}
                {!sOnly && multiOpts.length > 0 && (
                  <Field label={`Numri i pjesëve${sashSuggest > 1 ? ` (sugjerim për ${w.width} mm: ${sashSuggest})` : ''}`}>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      {multiOpts.map((m) => (
                        <select key={m.kind} value="" onChange={(e) => e.target.value && applyMulti(m, Number(e.target.value))}>
                          <option value="">{m.label}…</option>
                          {Array.from({ length: MAX_SASHES - 1 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n} {m.unit}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label="Ngjyra">
                  <select value={w.color} onChange={(e) => patch({ color: e.target.value })}>
                    {cat.colors.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Sasia (copë)"><NumInput value={w.qty} min={1} step={1} onChange={(v) => patch({ qty: Math.max(1, Math.floor(v)) })} /></Field>
                {!sOnly && (<Field label="Forma e dritares">
                  <select
                    value={w.shape?.type ?? 'rect'}
                    onChange={(e) => {
                      const t = e.target.value as ShapeType;
                      if (t === 'rect') return patch({ shape: undefined });
                      const base = { type: t } as NonNullable<WindowItem['shape']>;
                      if (t === 'arch') base.rise = Math.round(Math.min(w.width / 2, w.height - 100));
                      if (t === 'trapezoid') { base.lowH = Math.round(w.height / 2); base.lowSide = 'right'; }
                      if (t === 'triangle') base.apex = 50;
                      patch({ shape: base, kind: SHAPE_LABELS[t] });
                    }}
                  >
                    {(Object.keys(SHAPE_LABELS) as ShapeType[]).map((k) => <option key={k} value={k}>{SHAPE_LABELS[k]}</option>)}
                  </select>
                </Field>)}
                {w.shape?.type === 'arch' && (
                  <Field label="Lartësia e harkut (mm)" hint={`Maksimumi ${Math.round(Math.min(w.width / 2, w.height - 100))} mm (gjysmërreth)`}>
                    <NumInput value={w.shape.rise} min={50} onChange={(v) => patch({ shape: { ...w.shape!, rise: v } })} />
                  </Field>
                )}
                {w.shape?.type === 'trapezoid' && (
                  <>
                    <Field label="Lartësia e anës së ulët (mm)" hint={`Lartësia ${w.height} mm është ana e lartë`}>
                      <NumInput value={w.shape.lowH} min={100} onChange={(v) => patch({ shape: { ...w.shape!, lowH: v } })} />
                    </Field>
                    <Field label="Ana e ulët">
                      <select value={w.shape.lowSide ?? 'right'} onChange={(e) => patch({ shape: { ...w.shape!, lowSide: e.target.value as 'left' | 'right' } })}>
                        <option value="left">Majtas</option><option value="right">Djathtas</option>
                      </select>
                    </Field>
                  </>
                )}
                {w.shape?.type === 'triangle' && (
                  <Field label="Kulmi nga e majta (% e gjerësisë)" hint="50 = trekëndësh barakrah, 0 ose 100 = kënddrejtë">
                    <NumInput value={w.shape.apex} min={0} max={100} onChange={(v) => patch({ shape: { ...w.shape!, apex: v } })} />
                  </Field>
                )}
              </div>
              {isShaped(w.shape) && (
                <div className="hint" style={{ marginTop: 8 }}>
                  Gjerësia × lartësia janë përmasat e drejtkëndëshit rreth formës. Çmimi dhe qelqi llogariten sipas këtij drejtkëndëshi. Për formë: {normalizeShape(w.width, w.height, w.shape).warnings.join(' ') || 'në rregull'}.
                </div>
              )}
            </div>
            {sys?.panels && <PanelPicker value={w.panel} onChange={(p) => patch({ panel: p })} />}
            {!sOnly && (
            <div className="card">
              <div className="row sp" style={{ marginBottom: 6 }}>
                <b>Fashatura</b>
                <label className="chk"><input type="checkbox" checked={!!w.trims} onChange={(e) => patch({ trims: e.target.checked ? { ...DEFAULT_TRIM } : undefined })} /> Me fashatura</label>
              </div>
              {w.trims && (
                <div>
                  <div className="pill-row" style={{ marginBottom: 6 }}>
                    {(['top', 'left', 'right', 'bottom'] as const).map((k) => (
                      <label key={k} className="chk">
                        <input type="checkbox" checked={w.trims![k]} onChange={(e) => patch({ trims: { ...w.trims!, [k]: e.target.checked } })} /> {{ top: 'Sipër', left: 'Majtas', right: 'Djathtas', bottom: 'Poshtë' }[k]}
                      </label>
                    ))}
                  </div>
                  <Field label="Gjerësia e fashaturës (mm)"><NumInput value={w.trims.w} min={10} onChange={(v) => patch({ trims: { ...w.trims!, w: v } })} /></Field>
                </div>
              )}
              <div className="hint">Llogaritet në metra linearë sipas anëve të zgjedhura. Çmimi për ml: Cilësime → Punë krahu.</div>
            </div>
            )}
            <div className="card">
              <div className="row sp" style={{ marginBottom: 6 }}>
                <b>{sOnly ? 'Grila / persiane' : 'Roletë rrotulluese dhe rrjeta'}</b>
                {!sOnly && <label className="chk"><input type="checkbox" checked={!!w.shutter?.enabled} onChange={(e) => patch({ shutter: { ...(w.shutter ?? DEFAULT_SHUTTER), enabled: e.target.checked } })} /> Me roletë rrotulluese</label>}
              </div>
              {w.shutter?.enabled && (
                <div className="grid g2">
                  <Field label="Lloji">
                    <select value={w.shutter.kind ?? ''} onChange={(e) => {
                      const k = (e.target.value || undefined) as ShutterKind | undefined;
                      patch({ shutter: { ...w.shutter!, kind: k, motor: k === 'persian' ? false : w.shutter!.motor }, ...(sOnly && k ? { kind: SHUTTER_KIND_LABELS[k] } : {}) });
                    }}>
                      {!sOnly && <option value="">Roletë rrotulluese (çmimi bazë)</option>}
                      {SHUTTER_KINDS.filter((k) => sOnly || k !== 'persian').map((k) => <option key={k} value={k}>{SHUTTER_KIND_LABELS[k]}</option>)}
                    </select>
                  </Field>
                  {w.shutter.kind !== 'persian' && (
                    <Field label="Lartësia e kutisë (mm)" hint={sOnly ? 'Kutia e grilës sipër; lartësia e dritares më lart është lartësia e grilës' : 'Kutia vendoset sipër dritares, jashtë përmasave të dritares'}>
                      <NumInput value={w.shutter.boxH} min={100} max={600} onChange={(v) => patch({ shutter: { ...w.shutter!, boxH: v } })} />
                    </Field>
                  )}
                  {w.shutter.kind !== 'persian' && (
                    <label className="chk" style={{ alignSelf: 'end' }}>
                      <input type="checkbox" checked={w.shutter.motor} onChange={(e) => patch({ shutter: { ...w.shutter!, motor: e.target.checked } })} /> Me motor
                    </label>
                  )}
                </div>
              )}
              {!sOnly && netCells.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="small muted" style={{ marginBottom: 4 }}>Rrjetë kundër insekteve (zgjidh pjesët):</div>
                  <div className="pill-row">
                    {netCells.map((c) => (
                      <label key={c.key} className="chk">
                        <input type="checkbox" checked={!!w.nets?.[c.key]} onChange={(e) => patch({ nets: { ...(w.nets ?? {}), [c.key]: e.target.checked } })} /> Pjesa {c.key}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="hint" style={{ marginTop: 6 }}>Çmimet e roletës, motorit dhe rrjetës vendosen te Cilësimet → Punë krahu → Roletë dhe rrjeta.</div>
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
            {!sOnly && (<details className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Ndarja e dritares (për konfigurime të veçanta){isShaped(w.shape) ? ' — nuk përdoret për forma të veçanta' : ''}</summary>
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
            </details>)}
          </div>
          <div style={{ position: 'sticky', top: 8 }}>
            <div className="card">
              <h2>Vizatimi teknik 2D</h2>
              {sys && !sizeInvalid ? (
                <Drawing2D W={w.width} H={w.height} layout={w.layout} params={sys.params} colorHex={colorHex} glassLabels={glassLabels} showKeys shape={w.shape} shutter={w.shutter} nets={w.nets} panel={w.panel} fills={fillsHex} trims={w.trims} selected={selValid ? sel : undefined} onCell={setSel} />
              ) : (
                <div className="empty">Zgjidh sistemin dhe përmasat.</div>
              )}
              {sys && !sizeInvalid && !sOnly && (
                <div className="card" style={{ padding: 10, marginTop: 8 }}>
                  {selValid ? (
                    <div>
                      <div className="row sp" style={{ marginBottom: 6 }}>
                        <b>Pjesa e zgjedhur: {sel === 'T' ? 'sipër (tranzom)' : sel}</b>
                        <button className="btn sm" onClick={() => setSel('')}>✕</button>
                      </div>
                      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                        <button className={'btn sm' + (!w.fills?.[sel] ? ' primary' : '')} onClick={() => setFill(sel, false)}>Xham</button>
                        <button className={'btn sm' + (w.fills?.[sel] ? ' primary' : '')} onClick={() => setFill(sel, true, w.fills?.[sel]?.color)}>Mbushje / panel</button>
                      </div>
                      {!w.fills?.[sel] ? (
                        <Field label="Lloji i qelqit për këtë pjesë">
                          <select
                            value={w.cellGlass[sel] ?? ''}
                            onChange={(e) => {
                              const n = { ...w.cellGlass };
                              if (e.target.value) n[sel] = e.target.value; else delete n[sel];
                              patch({ cellGlass: n });
                            }}
                          >
                            <option value="">Si dritarja ({glass?.name ?? '-'})</option>
                            {cat.glassTypes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </Field>
                      ) : (
                        <Field label="Ngjyra e mbushjes" hint="Si korniza = e njëjta ngjyrë me dritaren. Çmimi për m² vendoset te Cilësimet → Punë krahu.">
                          <select value={w.fills[sel].color ?? ''} onChange={(e) => setFill(sel, true, e.target.value || undefined)}>
                            <option value="">Si korniza ({w.color || 'ngjyra e dritares'})</option>
                            {cat.colors.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                          </select>
                        </Field>
                      )}
                    </div>
                  ) : (
                    <div className="small muted">Kliko mbi një pjesë të vizatimit për ta bërë xham ose mbushje/panel.</div>
                  )}
                </div>
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
          <Window3D W={w.width} H={w.height} layout={w.layout} params={sys.params} colorHex={colorHex} glassThickness={glass?.thickness ?? 24} shape={w.shape} shutter={w.shutter} nets={w.nets} lowered={lowered} panel={w.panel} fills={fillsHex} />
          {w.shutter?.enabled && (
            <Field label={`Roleta e ulur: ${Math.round(lowered * 100)}%`}>
              <input type="range" min={0} max={1} step={0.05} value={lowered} onChange={(e) => setLowered(Number(e.target.value))} />
            </Field>
          )}
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
