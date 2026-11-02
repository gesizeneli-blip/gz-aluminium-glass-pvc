import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { aggregatePieces, calcWindow, effBarLength } from '../engine/calc';
import { optimizeCuts, CutResult } from '../engine/optimizer';
import { CalcBreakdown } from '../components/CalcBreakdown';
import { Field, NumInput, Tabs } from '../components/ui';
import { Drawing2D } from '../components/Drawing2D';
import { money, num } from '../lib/format';
import { defaultWindow } from './WindowEditor';
import { PRESETS } from '../engine/geometry';
import type { WindowItem } from '../types';

function useProjectWindows() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const windows = useLiveQuery(() => db.windows.toArray(), []) ?? [];
  const [pid, setPid] = useState<number | 'all'>('all');
  const ws = useMemo(() => (pid === 'all' ? windows : windows.filter((w) => w.projectId === pid)), [windows, pid]);
  const picker = (
    <Field label="Projekti">
      <select value={pid} onChange={(e) => setPid(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
        <option value="all">Të gjitha projektet</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)}
      </select>
    </Field>
  );
  return { projects, ws, pid, picker };
}

/* ------------------------------------------------------------------ Calculator */
export function CalculatorPage() {
  const cat = useCatalog();
  const { projects, ws, picker } = useProjectWindows();
  const [tab, setTab] = useState<'proj' | 'quick'>('proj');
  const [sel, setSel] = useState<number | 'all'>('all');
  const sym = cat.currency.symbol;
  const items = useMemo(() => (cat.ready ? ws.map((w) => ({ w, calc: calcWindow(w, cat.ctx) })) : []), [ws, cat.ready, cat.ctx]);
  const agg = useMemo(() => {
    const m = new Map<string, { mm: number; pieces: number; cost: number }>();
    items.forEach(({ calc }) =>
      calc.profileUse.forEach((u) => {
        const e = m.get(u.profileId) ?? { mm: 0, pieces: 0, cost: 0 };
        e.mm += u.mm * calc.qty;
        e.pieces += u.pieces * calc.qty;
        e.cost += u.cost;
        m.set(u.profileId, e);
      })
    );
    return [...m.entries()];
  }, [items]);

  const [qw, setQw] = useState<WindowItem | null>(null);
  const quick = useMemo(() => {
    if (!cat.ready) return null;
    return qw ?? defaultWindow(0, cat, 0);
  }, [qw, cat]);
  const qcalc = useMemo(() => (quick && cat.ready ? calcWindow(quick, cat.ctx) : null), [quick, cat]);
  const qsys = quick ? cat.ctx.systems.get(quick.systemId) : undefined;

  return (
    <div>
      <h1>Kalkulatori teknik</h1>
      <Tabs tabs={[{ key: 'proj', label: 'Nga projekti' }, { key: 'quick', label: 'Llogaritje e shpejtë' }]} value={tab} onChange={setTab} />
      {tab === 'proj' && (
        <>
          <div className="grid g2">{picker}
            <Field label="Dritarja">
              <select value={sel} onChange={(e) => setSel(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Përmbledhje e të gjitha</option>
                {ws.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.width}×{w.height})</option>)}
              </select>
            </Field>
          </div>
          <div style={{ height: 12 }} />
          {sel === 'all' ? (
            <div className="card tbl-wrap">
              <h2>Konsumi total i profileve</h2>
              <table>
                <thead><tr><th>Profili</th><th>Sistemi</th><th className="r">Copë</th><th className="r">Gjithsej (m)</th><th className="r">Shufra (përafërsisht)</th><th className="r">Kosto</th></tr></thead>
                <tbody>
                  {agg.map(([id, a]) => {
                    const p = cat.ctx.profiles.get(id);
                    return (
                      <tr key={id}>
                        <td>{p?.name ?? id}</td><td>{cat.ctx.systems.get(p?.systemId ?? '')?.name}</td>
                        <td className="r">{a.pieces}</td><td className="r">{num(a.mm / 1000, 2)}</td>
                        <td className="r">{p ? Math.ceil(a.mm / effBarLength(p)) : '-'}</td><td className="r">{money(a.cost, sym)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {agg.length === 0 && <div className="empty">Nuk ka dritare për të llogaritur.</div>}
              <div className="hint">Numri i saktë i shufrave jepet te “Optimizimi i prerjes”.</div>
            </div>
          ) : (
            items.filter((x) => x.w.id === sel).map(({ w, calc }) => (
              <div key={w.id} className="card">
                <div className="row sp"><h2>{w.name} — {w.width}×{w.height} mm</h2><Link className="btn sm" to={`/projects/${w.projectId}/window/${w.id}`}>Hap në dizajner</Link></div>
                <CalcBreakdown calc={calc} ctx={cat.ctx} sym={sym} />
              </div>
            ))
          )}
          {projects.length === 0 && <div className="empty">Krijo një projekt për të filluar.</div>}
        </>
      )}
      {tab === 'quick' && quick && qcalc && (
        <div className="split">
          <div className="card">
            <div className="grid g2">
              <Field label="Gjerësia (mm)"><NumInput value={quick.width} min={0} onChange={(v) => setQw({ ...quick, width: v })} /></Field>
              <Field label="Lartësia (mm)"><NumInput value={quick.height} min={0} onChange={(v) => setQw({ ...quick, height: v })} /></Field>
              <Field label="Sasia"><NumInput value={quick.qty} min={1} step={1} onChange={(v) => setQw({ ...quick, qty: Math.max(1, Math.floor(v)) })} /></Field>
              <Field label="Sistemi">
                <select value={quick.systemId} onChange={(e) => setQw({ ...quick, systemId: e.target.value })}>
                  {cat.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Qelqi">
                <select value={quick.glassId} onChange={(e) => setQw({ ...quick, glassId: e.target.value })}>
                  {cat.glassTypes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Konfigurimi">
                <select
                  value=""
                  onChange={(e) => {
                    const p = PRESETS.find((x) => x.key === e.target.value);
                    if (p) setQw({ ...quick, layout: JSON.parse(JSON.stringify(p.layout)), kind: p.name });
                  }}
                >
                  <option value="">{quick.kind}</option>
                  {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            {qsys && quick.width > 0 && quick.height > 0 && (
              <div style={{ marginTop: 10 }}><Drawing2D W={quick.width} H={quick.height} layout={quick.layout} params={qsys.params} shape={quick.shape} /></div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <select id="savepid" defaultValue="" style={{ flex: 1 }}>
                <option value="">Ruaj në projekt…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                className="btn primary"
                onClick={async () => {
                  const el = document.getElementById('savepid') as HTMLSelectElement;
                  const pid = Number(el.value);
                  if (!pid) return alert('Zgjidh projektin.');
                  const n = await db.windows.where('projectId').equals(pid).count();
                  await db.windows.add({ ...quick, projectId: pid, order: n, name: `Poz. ${n + 1}` });
                  alert('U ruajt në projekt.');
                }}
              >
                Ruaj
              </button>
            </div>
          </div>
          <div className="card"><CalcBreakdown calc={qcalc} ctx={cat.ctx} sym={sym} /></div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Cutting */
function CutDiagram({ r, label }: { r: CutResult; label?: string }) {
  const cap = r.barLength;
  return (
    <div>
      {label && <div className="small muted">{label}</div>}
      {r.bars.map((b, i) => (
        <div key={i}>
          <div className="small muted">Shufra {i + 1} — përdorur {num(b.used, 0)} mm, mbetje {num(b.waste, 0)} mm ({num((b.waste / cap) * 100, 1)}%)</div>
          <div className="cutbar">
            {b.pieces.map((p, j) => (
              <div key={j} title={`${p.length} mm${p.tag ? ' · ' + p.tag : ''}`} style={{ width: `${((p.length + 0) / cap) * 100}%`, background: ['#1d3557', '#2a4d7a', '#3c6591'][j % 3] }}>
                {p.length}
              </div>
            ))}
            <div style={{ width: `${(Math.max(0, cap - b.pieces.reduce((s, p) => s + p.length, 0)) / cap) * 100}%`, background: 'transparent', color: '#555' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CuttingPage() {
  const cat = useCatalog();
  const { ws, picker } = useProjectWindows();
  const [tab, setTab] = useState<'proj' | 'free'>('proj');
  const sym = cat.currency.symbol;
  const results = useMemo(() => {
    if (!cat.ready) return [];
    const items = ws.map((w) => ({ w, calc: calcWindow(w, cat.ctx) }));
    const agg = aggregatePieces(items);
    return [...agg.entries()].map(([pid, pcs]) => {
      const p = cat.ctx.profiles.get(pid);
      const bar = p ? effBarLength(p) : 6500;
      const r = optimizeCuts(pcs, bar, p?.kerf ?? 0, p?.cutAllowance ?? 0);
      return { pid, p, r, pieces: pcs.length };
    });
  }, [ws, cat.ready, cat.ctx]);

  const [free, setFree] = useState({ bar: 6500, kerf: 3, allow: 0, price: 0, text: '1800 x2\n1500\n1200\n900' });
  const freeRes = useMemo(() => {
    const pcs: { length: number }[] = [];
    free.text.split('\n').forEach((line) => {
      const m = line.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:[x*×]\s*(\d+))?$/i);
      if (m) for (let i = 0; i < Number(m[2] ?? 1); i++) pcs.push({ length: Number(m[1].replace(',', '.')) });
    });
    return optimizeCuts(pcs, free.bar, free.kerf, free.allow);
  }, [free]);

  return (
    <div>
      <h1>Optimizimi i prerjes</h1>
      <Tabs tabs={[{ key: 'proj', label: 'Nga projekti' }, { key: 'free', label: 'Llogaritje e lirë' }]} value={tab} onChange={setTab} />
      {tab === 'proj' && (
        <>
          {picker}
          <div className="hint" style={{ margin: '6px 0 12px' }}>
            Çdo profil optimizohet vetë (pa përzierje). Çdo copë konsumon gjatësi + shtesë prerjeje + kerf. Gjatësia e shufrës ndryshohet për secilin profil dhe ruhet.
          </div>
          {results.length === 0 && <div className="empty">Nuk ka copa për prerje.</div>}
          {results.map(({ pid, p, r, pieces }) => (
            <div key={pid} className="card">
              <div className="row sp">
                <h2 style={{ margin: 0 }}>{p?.name ?? pid}</h2>
                <div className="row">
                  <div style={{ width: 150 }}>
                    <Field label="Gjatësia e shufrës (mm)">
                      <NumInput value={p ? effBarLength(p) : 6500} min={1} onChange={(v) => p && db.profiles.update(p.id, { customBarLength: v > 0 ? v : undefined })} />
                    </Field>
                  </div>
                  <div style={{ width: 100 }}><Field label="Kerf (mm)"><NumInput value={p?.kerf ?? 0} min={0} onChange={(v) => p && db.profiles.update(p.id, { kerf: v })} /></Field></div>
                  <div style={{ width: 110 }}><Field label="Shtesë/copë"><NumInput value={p?.cutAllowance ?? 0} min={0} onChange={(v) => p && db.profiles.update(p.id, { cutAllowance: v })} /></Field></div>
                </div>
              </div>
              <div className="grid g4 keep2" style={{ margin: '10px 0' }}>
                <div className="stat"><div className="l">Shufra</div><div className="v">{r.bars.length}</div></div>
                <div className="stat"><div className="l">Copa</div><div className="v">{pieces}</div></div>
                <div className="stat"><div className="l">Mbetje / fire</div><div className="v">{num(r.wastePct, 1)}%</div></div>
                <div className="stat"><div className="l">Kosto e shufrave</div><div className="v">{money((r.bars.length * r.barLength) / 1000 * (p?.purchasePerM ?? 0), sym)}</div></div>
              </div>
              {r.oversize.length > 0 && <div className="alert err">{r.oversize.length} copë janë më të gjata se shufra ({r.oversize.slice(0, 5).map((o) => o.length).join(', ')} mm…). Rrit gjatësinë e shufrës ose kontrollo recetën.</div>}
              {p && p.stock > 0 && r.bars.length > p.stock && <div className="alert warn">Stoku ({p.stock}) është më i vogël se shufrat e nevojshme ({r.bars.length}).</div>}
              <div className="small muted">Konsum neto {num(r.totalNet / 1000, 2)} m · kufiri teorik minimal {r.lowerBound} shufra</div>
              <CutDiagram r={r} />
            </div>
          ))}
        </>
      )}
      {tab === 'free' && (
        <div className="split">
          <div className="card">
            <div className="grid g2">
              <Field label="Gjatësia e shufrës (mm)"><NumInput value={free.bar} min={1} onChange={(v) => setFree({ ...free, bar: v })} /></Field>
              <Field label="Kerf (mm)"><NumInput value={free.kerf} min={0} onChange={(v) => setFree({ ...free, kerf: v })} /></Field>
              <Field label="Shtesë prerjeje për copë (mm)"><NumInput value={free.allow} min={0} onChange={(v) => setFree({ ...free, allow: v })} /></Field>
              <Field label={`Çmimi i blerjes (${sym}/m)`}><NumInput value={free.price} min={0} onChange={(v) => setFree({ ...free, price: v })} /></Field>
            </div>
            <Field label="Copat (një për rresht; p.sh. “1800 x2”)">
              <textarea style={{ minHeight: 160 }} className="mono" value={free.text} onChange={(e) => setFree({ ...free, text: e.target.value })} />
            </Field>
          </div>
          <div className="card">
            <div className="grid g3 keep2" style={{ marginBottom: 10 }}>
              <div className="stat"><div className="l">Shufra</div><div className="v">{freeRes.bars.length}</div></div>
              <div className="stat"><div className="l">Fire</div><div className="v">{num(freeRes.wastePct, 1)}%</div></div>
              <div className="stat"><div className="l">Kosto</div><div className="v">{money((freeRes.bars.length * free.bar) / 1000 * free.price, sym)}</div></div>
            </div>
            {freeRes.oversize.length > 0 && <div className="alert err">Copë më të gjata se shufra: {freeRes.oversize.map((o) => o.length).join(', ')} mm</div>}
            <CutDiagram r={freeRes} />
            <div className="small muted">Konsum neto {num(freeRes.totalNet, 0)} mm · mbetje totale {num(freeRes.totalWaste, 0)} mm</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Glass */
export function GlassPage() {
  const cat = useCatalog();
  const { ws, picker } = useProjectWindows();
  const sym = cat.currency.symbol;
  const items = useMemo(() => (cat.ready ? ws.map((w) => ({ w, calc: calcWindow(w, cat.ctx) })) : []), [ws, cat.ready, cat.ctx]);
  const byType = new Map<string, { name: string; area: number; panels: number; cost: number; sell: number }>();
  items.forEach(({ calc }) => calc.glass.forEach((g) => {
    const e = byType.get(g.glassId) ?? { name: g.glassName, area: 0, panels: 0, cost: 0, sell: 0 };
    e.area += g.billedArea * calc.qty; e.panels += calc.qty; e.cost += g.cost * calc.qty; e.sell += g.sell * calc.qty;
    byType.set(g.glassId, e);
  }));
  return (
    <div>
      <h1>Kalkulatori i qelqit</h1>
      {picker}
      <div className="hint" style={{ margin: '6px 0 12px' }}>Përmasat e qelqit vijnë nga formulat e sistemit (hapja e kasës, kanati, rebate, zbritjet) – jo nga përmasat e jashtme. Formulat ndryshohen te Materialet → Sisteme → Formula e qelqit.</div>
      <div className="card tbl-wrap">
        <h2>Përmbledhje sipas llojit</h2>
        <table>
          <thead><tr><th>Qelqi</th><th className="r">Panele</th><th className="r">Sipërfaqja m²</th><th className="r">Kosto blerjeje</th><th className="r">Vlera e shitjes</th></tr></thead>
          <tbody>
            {[...byType.values()].map((v) => (
              <tr key={v.name}><td>{v.name}</td><td className="r">{v.panels}</td><td className="r">{num(v.area, 3)}</td><td className="r">{money(v.cost, sym)}</td><td className="r">{money(v.sell, sym)}</td></tr>
            ))}
          </tbody>
        </table>
        {byType.size === 0 && <div className="empty">Nuk ka qelq për llogaritje.</div>}
      </div>
      <div className="card tbl-wrap">
        <h2>Panelet</h2>
        <table>
          <thead><tr><th>Dritarja</th><th>Pjesa</th><th className="r">Gjerësia</th><th className="r">Lartësia</th><th>Trashësia</th><th>Përbërja</th><th className="r">Sasia</th><th className="r">m²</th><th className="r">Blerja</th><th className="r">Shitja</th><th className="r">Kosto totale</th></tr></thead>
          <tbody>
            {items.flatMap(({ w, calc }) => calc.glass.map((g) => (
              <tr key={w.id + g.cell}>
                <td><Link to={`/projects/${w.projectId}/window/${w.id}`}>{w.name}</Link></td><td>{g.cell}</td>
                <td className="r">{g.w}</td><td className="r">{g.h}</td><td>{g.thickness ? g.thickness + ' mm' : '-'}</td><td>{g.composition || g.glassName}</td>
                <td className="r">{calc.qty}</td><td className="r">{num(g.billedArea * calc.qty, 3)}</td>
                <td className="r">{money(g.cost, sym)}</td><td className="r">{money(g.sell, sym)}</td><td className="r">{money(g.cost * calc.qty, sym)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Accessories */
export function AccessoriesPage() {
  const cat = useCatalog();
  const { ws, picker } = useProjectWindows();
  const sym = cat.currency.symbol;
  const items = useMemo(() => (cat.ready ? ws.map((w) => ({ w, calc: calcWindow(w, cat.ctx) })) : []), [ws, cat.ready, cat.ctx]);
  const agg = new Map<string, { name: string; unit: string; qty: number; cost: number; sell: number; stock: number }>();
  items.forEach(({ calc }) => calc.accessories.forEach((a) => {
    const e = agg.get(a.accessoryId) ?? { name: a.name, unit: a.unit, qty: 0, cost: 0, sell: 0, stock: cat.ctx.acc.get(a.accessoryId)?.stock ?? 0 };
    e.qty += a.qty * calc.qty; e.cost += a.cost * calc.qty; e.sell += a.sell * calc.qty;
    agg.set(a.accessoryId, e);
  }));
  return (
    <div>
      <h1>Kalkulatori i aksesorëve</h1>
      {picker}
      <div className="hint" style={{ margin: '6px 0 12px' }}>Sasitë llogariten nga receta e aksesorëve të sistemit sipas llojit të hapjes. Korrigjimet manuale bëhen te dritarja → Llogaritja teknike.</div>
      <div className="card tbl-wrap">
        <table>
          <thead><tr><th>Aksesori</th><th className="r">Sasia totale</th><th>Njësia</th><th className="r">Stok</th><th className="r">Kosto blerjeje</th><th className="r">Vlera e shitjes</th></tr></thead>
          <tbody>
            {[...agg.values()].map((v) => (
              <tr key={v.name}>
                <td>{v.name}</td><td className="r">{num(v.qty, 2)}</td><td>{v.unit}</td>
                <td className="r">{v.stock}{v.stock > 0 && v.qty > v.stock && <span className="tag bad" style={{ marginLeft: 6 }}>mungon</span>}</td>
                <td className="r">{money(v.cost, sym)}</td><td className="r">{money(v.sell, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {agg.size === 0 && <div className="empty">Nuk ka aksesorë për llogaritje.</div>}
      </div>
    </div>
  );
}
