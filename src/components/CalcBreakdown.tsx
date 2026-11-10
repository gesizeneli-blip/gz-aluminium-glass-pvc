import type { Calc, WindowItem } from '../types';
import { CalcCtx } from '../engine/calc';
import { money, num } from '../lib/format';
import { NumInput, Warnings } from './ui';

export function CostTable({ calc, sym }: { calc: Calc; sym: string }) {
  const c = calc.costs;
  const rows: [string, number][] = [
    ['Profile', c.profiles],
    ['Armaturë çeliku', c.reinforcement],
    ['Qelq', c.glass],
    ['Aksesorë', c.accessories],
    ['Garnitura dhe materiale ndihmëse', c.gaskets],
    ['Punë krahu', c.labor],
    ['Shpenzime të tjera', c.other]
  ];
  return (
    <table>
      <tbody>
        {rows.map(([l, v]) => (
          <tr key={l}>
            <td>{l}</td>
            <td className="r">{money(v, sym)}</td>
          </tr>
        ))}
        <tr>
          <td><b>Kosto materialesh</b></td>
          <td className="r"><b>{money(c.material, sym)}</b></td>
        </tr>
        <tr>
          <td><b>Kosto totale prodhimi</b></td>
          <td className="r"><b>{money(c.total, sym)}</b></td>
        </tr>
        <tr>
          <td><b>Çmimi i shitjes</b></td>
          <td className="r"><b>{money(calc.price, sym)}</b></td>
        </tr>
        <tr>
          <td>Fitimi bruto</td>
          <td className="r" style={{ color: calc.profit >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{money(calc.profit, sym)}</td>
        </tr>
        <tr>
          <td>Marzhi</td>
          <td className="r">{num(calc.marginPct, 1)} %</td>
        </tr>
        <tr>
          <td>Fitimi për m²</td>
          <td className="r">{money(calc.profitPerM2, sym)}</td>
        </tr>
        <tr>
          <td>Fitimi për copë</td>
          <td className="r">{money(calc.profitPerUnit, sym)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function CalcBreakdown({
  calc, ctx, w, onPatch, sym
}: {
  calc: Calc;
  ctx: CalcCtx;
  w?: WindowItem;
  onPatch?: (p: Partial<WindowItem>) => void;
  sym: string;
}) {
  const edit = !!(w && onPatch);
  const byProfile = new Map<string, typeof calc.pieces>();
  calc.pieces.forEach((p) => byProfile.set(p.profileId, [...(byProfile.get(p.profileId) ?? []), p]));
  return (
    <div>
      <Warnings errors={calc.errors} warnings={calc.warnings} />
      <h3>Profile (për 1 njësi{calc.qty > 1 ? `; sasia ${calc.qty}` : ''})</h3>
      {calc.profileUse.length === 0 && <div className="empty">Asnjë profil i llogaritur.</div>}
      {calc.profileUse.map((u) => {
        const prof = ctx.profiles.get(u.profileId);
        const pcs = byProfile.get(u.profileId) ?? [];
        return (
          <div key={u.profileId} className="card" style={{ padding: 10 }}>
            <div className="row sp">
              <b>{u.name}</b>
              <span className="muted small">
                Gjithsej: {num(u.mm, 1)} mm = {num(u.meters, 3)} ml
                {prof?.wastePct ? ` (+${prof.wastePct}% humbje)` : ''} · kosto {money(u.cost, sym)}
              </span>
            </div>
            {pcs.length > 0 && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rreshti i recetës</th>
                      <th className="r">Gjatësia (mm)</th>
                      <th className="r">Copë</th>
                      <th className="r">Gjithsej (mm)</th>
                      {edit && <th>Përfshi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pcs.map((p, i) => (
                      <tr key={i}>
                        <td>
                          {p.label} {p.cell && <span className="muted small">[{p.cell}]</span>}
                          {p.manual && <span className="tag gold" style={{ marginLeft: 6 }}>manual</span>}
                        </td>
                        <td className="r">{num(p.length, 1)}</td>
                        <td className="r">{p.qty}</td>
                        <td className="r">{num(p.length * p.qty, 1)}</td>
                        {edit && (
                          <td>
                            {!p.manual && (
                              <input
                                type="checkbox"
                                checked={!w!.lineOff[p.lineId]}
                                onChange={(e) => onPatch!({ lineOff: { ...w!.lineOff, [p.lineId]: !e.target.checked } })}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {u.meters > 0 && pcs.length === 0 && <div className="small muted">Konsum në metra linearë (nuk pritet nga shufra).</div>}
          </div>
        );
      })}
      {calc.meters.length > 0 && (
        <div className="small muted" style={{ marginBottom: 10 }}>
          Garnitura / metra linearë: {calc.meters.map((m) => `${m.label}: ${num(m.meters, 2)} ml`).join(' · ')}
        </div>
      )}
      {edit && w!.lineOff && Object.entries(w!.lineOff).some(([, v]) => v) && (
        <div className="alert info">Rreshta të çaktivizuar manualisht nuk llogariten. Ri-aktivizoji nga kutia “Përfshi”. (Rreshtat e çaktivizuar nuk shfaqen më lart; hiqi shenjën nga lista më poshtë.)</div>
      )}
      {edit && w!.lineOff && (
        <div className="pill-row" style={{ marginBottom: 10 }}>
          {Object.entries(w!.lineOff).filter(([, v]) => v).map(([id]) => (
            <button key={id} className="btn sm" onClick={() => onPatch!({ lineOff: { ...w!.lineOff, [id]: false } })}>
              ↺ Rikthe “{id}”
            </button>
          ))}
        </div>
      )}

      <h3>Qelqi</h3>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Pjesa</th><th className="r">Gjerësia</th><th className="r">Lartësia</th><th>Trashësia</th><th>Përbërja</th>
              <th className="r">Sipërfaqja m²</th><th className="r">Blerja</th><th className="r">Shitja</th>
            </tr>
          </thead>
          <tbody>
            {calc.glass.map((g) => (
              <tr key={g.cell}>
                <td>{g.cell}</td><td className="r">{g.w}</td><td className="r">{g.h}</td>
                <td>{g.thickness ? `${g.thickness} mm` : '-'}</td>
                <td>{g.composition || g.glassName}</td>
                <td className="r">{num(g.billedArea, 3)}</td>
                <td className="r">{money(g.cost, sym)}</td>
                <td className="r">{money(g.sell, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 14 }}>Aksesorë</h3>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Aksesori</th><th className="r">Automatik</th><th className="r">Sasia</th><th className="r">Blerja</th><th className="r">Shitja</th>
            </tr>
          </thead>
          <tbody>
            {calc.accessories.map((a) => (
              <tr key={a.accessoryId}>
                <td>{a.name}</td>
                <td className="r">{num(a.autoQty, 2)}</td>
                <td className="r" style={{ width: 130 }}>
                  {edit ? (
                    <NumInput value={a.qty} min={0} onChange={(v) => onPatch!({ accQty: { ...w!.accQty, [a.accessoryId]: v } })} />
                  ) : (
                    a.qty
                  )}
                </td>
                <td className="r">{money(a.cost, sym)}</td>
                <td className="r">{money(a.sell, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {calc.addons && calc.addons.length > 0 && (
        <div>
          <h3 style={{ marginTop: 14 }}>Roletë dhe rrjeta</h3>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Artikulli</th><th className="r">Sasia</th><th className="r">Blerja</th><th className="r">Shitja</th></tr></thead>
              <tbody>
                {calc.addons.map((a, i) => (
                  <tr key={i}><td>{a.label}</td><td className="r">{num(a.qty, 2)} {a.unit}</td><td className="r">{money(a.cost, sym)}</td><td className="r">{money(a.sell, sym)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {edit && Object.keys(w!.accQty).length > 0 && (
        <button className="btn sm" style={{ marginTop: 6 }} onClick={() => onPatch!({ accQty: {} })}>
          ↺ Rikthe sasitë automatike të aksesorëve
        </button>
      )}
    </div>
  );
}
