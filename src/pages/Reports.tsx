import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { Field, Stat } from '../components/ui';
import { money, num } from '../lib/format';
import { quoteTotals } from '../lib/quotation';

interface Agg { units: number; area: number; sales: number; material: number; cost: number }
const blank = (): Agg => ({ units: 0, area: 0, sales: 0, material: 0, cost: 0 });

export default function Reports() {
  const cat = useCatalog();
  const quotes = useLiveQuery(() => db.quotations.toArray(), []) ?? [];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [client, setClient] = useState('');
  const [project, setProject] = useState('');
  const [system, setSystem] = useState('');
  const [draft, setDraft] = useState(false);
  const sym = cat.currency.symbol;

  const clients = [...new Set(quotes.map((q) => q.client.name).filter(Boolean))];
  const projectsList = [...new Set(quotes.map((q) => q.projectName).filter(Boolean))];

  const r = useMemo(() => {
    const qs = quotes.filter(
      (q) => (draft || q.status !== 'Draft') && q.status !== 'Refuzuar' &&
        (!from || q.date >= from) && (!to || q.date <= to) && (!client || q.client.name === client) && (!project || q.projectName === project)
    );
    const total = blank();
    const bySys = new Map<string, Agg>();
    const byGlass = new Map<string, { area: number; panels: number; cost: number }>();
    const byAcc = new Map<string, { qty: number; cost: number }>();
    const byProject: { number: string; name: string; sales: number; cost: number }[] = [];
    const byMonth = new Map<string, number>();
    for (const q of qs) {
      const f = 1 - (q.discountPct || 0) / 100;
      let ps = 0, pc = 0;
      for (const it of q.items) {
        if (system && it.sysId !== system) continue;
        const qty = it.win.qty;
        const sales = it.price * f;
        const a = bySys.get(it.sysName) ?? blank();
        const area = it.calc.area * qty;
        a.units += qty; a.area += area; a.sales += sales; a.material += it.calc.costs.material; a.cost += it.calc.costs.total;
        bySys.set(it.sysName, a);
        total.units += qty; total.area += area; total.sales += sales; total.material += it.calc.costs.material; total.cost += it.calc.costs.total;
        ps += sales; pc += it.calc.costs.total;
        for (const g of it.calc.glass) {
          const e = byGlass.get(g.glassName) ?? { area: 0, panels: 0, cost: 0 };
          e.area += g.billedArea * qty; e.panels += qty; e.cost += g.cost * qty;
          byGlass.set(g.glassName, e);
        }
        for (const ac of it.calc.accessories) {
          const e = byAcc.get(ac.name) ?? { qty: 0, cost: 0 };
          e.qty += ac.qty * qty; e.cost += ac.cost * qty;
          byAcc.set(ac.name, e);
        }
      }
      byProject.push({ number: q.number, name: `${q.projectName} (${q.client.name})`, sales: ps, cost: pc });
      const m = q.date.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + ps);
      void quoteTotals;
    }
    return { qs, total, bySys, byGlass, byAcc, byProject, byMonth };
  }, [quotes, from, to, client, project, system, draft]);

  const profit = r.total.sales - r.total.cost;
  const maxMonth = Math.max(1, ...r.byMonth.values());

  return (
    <div>
      <h1>Raporte dhe fitimi</h1>
      <div className="hint" style={{ marginBottom: 8 }}>Raportet bazohen te ofertat e lëshuara (pamjet e ruajtura me çmimet e asaj kohe), pa ofertat e refuzuara.</div>
      <div className="card">
        <div className="grid g4 keep2">
          <Field label="Nga data"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Deri në datën"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Klienti">
            <select value={client} onChange={(e) => setClient(e.target.value)}><option value="">Të gjithë</option>{clients.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Projekti">
            <select value={project} onChange={(e) => setProject(e.target.value)}><option value="">Të gjitha</option>{projectsList.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Sistemi">
            <select value={system} onChange={(e) => setSystem(e.target.value)}><option value="">Të gjitha</option>{cat.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
          <label className="chk" style={{ alignSelf: 'end' }}><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Përfshi draft</label>
        </div>
      </div>

      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat label="Shitje" value={money(r.total.sales, sym)} />
        <Stat label="Shpenzime materialesh" value={money(r.total.material, sym)} />
        <Stat label="Kosto prodhimi" value={money(r.total.cost, sym)} />
        <Stat label="Fitimi" value={money(profit, sym)} tone={profit >= 0 ? 'pos' : 'neg'} />
        <Stat label="Marzhi i fitimit" value={`${num(r.total.sales > 0 ? (profit / r.total.sales) * 100 : 0, 1)} %`} />
        <Stat label="Fitimi për m²" value={money(r.total.area > 0 ? profit / r.total.area : 0, sym)} />
        <Stat label="Copë / m²" value={`${r.total.units} / ${num(r.total.area, 1)}`} />
        <Stat label="Oferta" value={r.qs.length} />
      </div>

      <div className="card">
        <h2>Shitje sipas muajve</h2>
        <div className="bars-chart">
          {[...r.byMonth.entries()].sort().map(([m, v]) => (
            <div key={m} className="row" style={{ flexWrap: 'nowrap', marginBottom: 4 }}>
              <span style={{ width: 70 }} className="mono">{m}</span>
              <div className="grow"><div className="b" style={{ width: `${(v / maxMonth) * 100}%` }} /></div>
              <span style={{ width: 130, textAlign: 'right' }}>{money(v, sym)}</span>
            </div>
          ))}
          {r.byMonth.size === 0 && <div className="empty">Pa të dhëna.</div>}
        </div>
      </div>

      <div className="card tbl-wrap">
        <h2>Sistemet më të përdorura</h2>
        <table>
          <thead><tr><th>Sistemi</th><th className="r">Copë</th><th className="r">m²</th><th className="r">Shitje</th><th className="r">Kosto</th><th className="r">Fitimi</th></tr></thead>
          <tbody>
            {[...r.bySys.entries()].sort((a, b) => b[1].area - a[1].area).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td className="r">{v.units}</td><td className="r">{num(v.area, 2)}</td><td className="r">{money(v.sales, sym)}</td><td className="r">{money(v.cost, sym)}</td><td className="r">{money(v.sales - v.cost, sym)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid g2">
        <div className="card tbl-wrap">
          <h2>Llojet e qelqit</h2>
          <table>
            <thead><tr><th>Qelqi</th><th className="r">Panele</th><th className="r">m²</th><th className="r">Kosto</th></tr></thead>
            <tbody>
              {[...r.byGlass.entries()].sort((a, b) => b[1].area - a[1].area).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td className="r">{v.panels}</td><td className="r">{num(v.area, 2)}</td><td className="r">{money(v.cost, sym)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card tbl-wrap">
          <h2>Konsumi i aksesorëve</h2>
          <table>
            <thead><tr><th>Aksesori</th><th className="r">Sasia</th><th className="r">Kosto</th></tr></thead>
            <tbody>
              {[...r.byAcc.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td className="r">{num(v.qty, 1)}</td><td className="r">{money(v.cost, sym)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card tbl-wrap">
        <h2>Performanca e projekteve</h2>
        <table>
          <thead><tr><th>Oferta</th><th>Projekti</th><th className="r">Shitje</th><th className="r">Kosto</th><th className="r">Fitimi</th><th className="r">Marzhi</th></tr></thead>
          <tbody>
            {r.byProject.map((p) => (
              <tr key={p.number}>
                <td>{p.number}</td><td>{p.name}</td><td className="r">{money(p.sales, sym)}</td><td className="r">{money(p.cost, sym)}</td>
                <td className="r">{money(p.sales - p.cost, sym)}</td><td className="r">{num(p.sales > 0 ? ((p.sales - p.cost) / p.sales) * 100 : 0, 1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.byProject.length === 0 && <div className="empty">Nuk ka oferta të lëshuara për filtrat e zgjedhur.</div>}
      </div>
    </div>
  );
}
