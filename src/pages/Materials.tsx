import { useState } from 'react';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { Field, Modal, NumInput, Tabs, confirmDo } from '../components/ui';
import type { AccLine, AccMatch, Accessory, GlassType, Profile, RecipeLine, Scope, System } from '../types';
import { tryEvaluate } from '../engine/formula';
import { uid, money } from '../lib/format';
import { effBarLength } from '../engine/calc';

const SCOPES: { key: Scope; label: string; vars: string }[] = [
  { key: 'window', label: 'Dritare (1 herë)', vars: 'W, H, nCols + parametrat' },
  { key: 'cell', label: 'Çdo pjesë (fikse + hapje)', vars: 'W, H, CW, CH, SW, SH, GW, GH' },
  { key: 'sash', label: 'Çdo kanat (hapje)', vars: 'W, H, CW, CH, SW, SH, GW, GH' },
  { key: 'fixed', label: 'Çdo pjesë fikse', vars: 'W, H, CW, CH, GW, GH' },
  { key: 'mullionV', label: 'Çdo montant vertikal', vars: 'W, H, MH' },
  { key: 'mullionH', label: 'Çdo ndarëse horizontale', vars: 'W, H, MH, CW' }
];
const MATCHES: { key: AccMatch; label: string }[] = [
  { key: 'window', label: 'Dritare (1 herë)' },
  { key: 'any-sash', label: 'Çdo kanat' },
  { key: 'tilt-turn', label: 'Anim + hapje' },
  { key: 'turn', label: 'Hapje' },
  { key: 'tilt', label: 'Vetëm anim' },
  { key: 'slide', label: 'Rrëshqitëse' },
  { key: 'door', label: 'Derë' },
  { key: 'fixed', label: 'Fikse' }
];

const TEST_VARS = { W: 1200, H: 1500, CW: 500, CH: 1380, SW: 500, SH: 1380, GW: 350, GH: 1230, MH: 1380, nCols: 2, nRows: 1 };

function FormulaInput({ value, onChange, params }: { value: string; onChange: (v: string) => void; params: Record<string, number> }) {
  const r = tryEvaluate(value, { ...params, ...TEST_VARS });
  return (
    <div>
      <input className="mono" value={value} onChange={(e) => onChange(e.target.value)} style={r.ok ? undefined : { borderColor: 'var(--bad)' }} />
      <div className="hint" style={{ color: r.ok ? undefined : 'var(--bad)' }}>
        {r.ok ? `test (1200×1500): = ${Math.round(r.value * 10) / 10}` : r.error}
      </div>
    </div>
  );
}

function SystemEditor({ sys, onClose }: { sys: System; onClose: () => void }) {
  const cat = useCatalog();
  const [s, setS] = useState<System>(JSON.parse(JSON.stringify(sys)));
  const [tab, setTab] = useState<'p' | 'g' | 'r' | 'a'>('p');
  const sysProfiles = cat.profiles.filter((p) => p.systemId === s.id);
  const set = (p: Partial<System>) => setS((c) => ({ ...c, ...p }));
  const upLine = (i: number, p: Partial<RecipeLine>) => set({ recipe: s.recipe.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const upAcc = (i: number, p: Partial<AccLine>) => set({ accRecipe: s.accRecipe.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const zeros = Object.entries(s.params).filter(([, v]) => v === 0).map(([k]) => k);

  return (
    <Modal title={`Sistemi: ${s.name}`} onClose={onClose} wide>
      <div className="grid g3">
        <Field label="Emri"><input value={s.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Materiali">
          <select value={s.material} onChange={(e) => set({ material: e.target.value as 'pvc' | 'alu' | 'glass' })}>
            <option value="pvc">PVC</option><option value="alu">Alumin</option><option value="glass">Vetëm xham</option>
          </select>
        </Field>
        <Field label="Grupi (në listën e sistemeve)"><input value={s.group ?? ''} onChange={(e) => set({ group: e.target.value })} /></Field>
        <Field label="Lloji (përcakton modelet e hapjes)">
          <select value={s.mode ?? 'swing'} onChange={(e) => set({ mode: e.target.value as any })}>
            <option value="swing">Me hapje</option><option value="slide">Me shinë (rrëshqitës)</option>
            <option value="fold">Me palosje</option><option value="fixed">Fikse</option><option value="door">Me derë</option>
          </select>
        </Field>
        <label className="chk"><input type="checkbox" checked={s.verified} onChange={(e) => set({ verified: e.target.checked })} /> E verifikuar nga unë (heq paralajmërimin)</label>
      </div>
      {!s.verified && zeros.length > 0 && (
        <div className="alert warn">Parametra me vlerë 0 (duhen plotësuar nga katalogu): <b>{zeros.join(', ')}</b></div>
      )}
      <Tabs
        tabs={[{ key: 'p', label: 'Parametra' }, { key: 'g', label: 'Formula e qelqit' }, { key: 'r', label: `Receta e profileve (${s.recipe.length})` }, { key: 'a', label: `Receta e aksesorëve (${s.accRecipe.length})` }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'p' && (
        <div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Parametrat përdoren në formula si ndryshore (p.sh. <span className="mono">W - weldAllow</span>). frameW, sashW, mullionW, frameDepth, sashDepth përdoren edhe për vizatimin/3D. Zbritjet e salduar/prerjes dhe të qelqit janë 0 deri sa t’i plotësosh.
          </div>
          <div className="grid g3">
            {Object.entries(s.params).map(([k, v]) => (
              <div key={k} className="row" style={{ flexWrap: 'nowrap' }}>
                <Field label={k}><NumInput value={v} onChange={(x) => set({ params: { ...s.params, [k]: x } })} /></Field>
                {!['frameW', 'sashW', 'mullionW', 'frameDepth', 'sashDepth', 'sashAdd'].includes(k) && (
                  <button className="btn sm danger" style={{ marginTop: 20 }} onClick={() => { const n = { ...s.params }; delete n[k]; set({ params: n }); }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button
            className="btn sm" style={{ marginTop: 10 }}
            onClick={() => {
              const name = window.prompt('Emri i parametrit (shkronja/numra, pa hapësira):', '');
              if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !(name in s.params)) set({ params: { ...s.params, [name]: 0 } });
              else if (name) alert('Emër i pavlefshëm ose ekziston.');
            }}
          >
            + Parametër i ri
          </button>
          <Field label="Shënime"><textarea value={s.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
      )}

      {tab === 'g' && (
        <div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Përmasat e qelqit llogariten nga këto formula (jo nga përmasat e jashtme). Ndryshore: CW, CH (hapja e kasës), SW, SH (kanati = hapja + sashAdd), W, H dhe parametrat.
          </div>
          <div className="grid g2">
            <Field label="Qelq në pjesë FIKSE – gjerësia"><FormulaInput value={s.glassFormulas.fixedW} params={s.params} onChange={(v) => set({ glassFormulas: { ...s.glassFormulas, fixedW: v } })} /></Field>
            <Field label="Qelq në pjesë FIKSE – lartësia"><FormulaInput value={s.glassFormulas.fixedH} params={s.params} onChange={(v) => set({ glassFormulas: { ...s.glassFormulas, fixedH: v } })} /></Field>
            <Field label="Qelq në KANAT – gjerësia"><FormulaInput value={s.glassFormulas.sashW} params={s.params} onChange={(v) => set({ glassFormulas: { ...s.glassFormulas, sashW: v } })} /></Field>
            <Field label="Qelq në KANAT – lartësia"><FormulaInput value={s.glassFormulas.sashH} params={s.params} onChange={(v) => set({ glassFormulas: { ...s.glassFormulas, sashH: v } })} /></Field>
          </div>
        </div>
      )}

      {tab === 'r' && (
        <div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Çdo rresht prodhon copë të prera nga shufra (“shufër”) ose konsum në ml (“metra”, p.sh. garnitura). Gjatësia dhe sasia janë formula.
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>On</th><th>Emri</th><th>Zbatohet te</th><th>Profili</th><th>Lloji</th><th>Gjatësia (mm)</th><th>Sasia</th><th /></tr></thead>
              <tbody>
                {s.recipe.map((l, i) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" checked={l.enabled} onChange={(e) => upLine(i, { enabled: e.target.checked })} /></td>
                    <td style={{ minWidth: 150 }}><input value={l.label} onChange={(e) => upLine(i, { label: e.target.value })} /></td>
                    <td style={{ minWidth: 150 }}>
                      <select value={l.scope} onChange={(e) => upLine(i, { scope: e.target.value as Scope })}>
                        {SCOPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                      <div className="hint">{SCOPES.find((x) => x.key === l.scope)?.vars}</div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <select value={l.profileId} onChange={(e) => upLine(i, { profileId: e.target.value })}>
                        <option value="">—</option>
                        {sysProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={l.kind} onChange={(e) => upLine(i, { kind: e.target.value as 'bar' | 'meter' })}>
                        <option value="bar">shufër</option><option value="meter">metra</option>
                      </select>
                    </td>
                    <td style={{ minWidth: 190 }}><FormulaInput value={l.lengthFormula} params={s.params} onChange={(v) => upLine(i, { lengthFormula: v })} /></td>
                    <td style={{ minWidth: 100 }}><FormulaInput value={l.qtyFormula} params={s.params} onChange={(v) => upLine(i, { qtyFormula: v })} /></td>
                    <td><button className="btn sm danger" onClick={() => set({ recipe: s.recipe.filter((_, j) => j !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn sm" style={{ marginTop: 8 }}
            onClick={() => set({ recipe: [...s.recipe, { id: uid('r'), label: 'Rresht i ri', scope: 'window', profileId: sysProfiles[0]?.id ?? '', kind: 'bar', lengthFormula: 'W', qtyFormula: '1', enabled: true }] })}
          >
            + Rresht i ri
          </button>
        </div>
      )}

      {tab === 'a' && (
        <div>
          <div className="hint" style={{ marginBottom: 8 }}>Sasia llogaritet për çdo kanat që përputhet me llojin e hapjes (ose 1 herë për dritaren). Ndryshore: W, H, CW, CH, SW, SH.</div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>On</th><th>Emri</th><th>Aksesori</th><th>Për</th><th>Sasia (formulë)</th><th /></tr></thead>
              <tbody>
                {s.accRecipe.map((l, i) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" checked={l.enabled} onChange={(e) => upAcc(i, { enabled: e.target.checked })} /></td>
                    <td style={{ minWidth: 150 }}><input value={l.label} onChange={(e) => upAcc(i, { label: e.target.value })} /></td>
                    <td style={{ minWidth: 160 }}>
                      <select value={l.accessoryId} onChange={(e) => upAcc(i, { accessoryId: e.target.value })}>
                        {cat.accessories.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={l.match} onChange={(e) => upAcc(i, { match: e.target.value as AccMatch })}>
                        {MATCHES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                    </td>
                    <td style={{ minWidth: 150 }}><FormulaInput value={l.qtyFormula} params={s.params} onChange={(v) => upAcc(i, { qtyFormula: v })} /></td>
                    <td><button className="btn sm danger" onClick={() => set({ accRecipe: s.accRecipe.filter((_, j) => j !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn sm" style={{ marginTop: 8 }}
            onClick={() => set({ accRecipe: [...s.accRecipe, { id: uid('a'), label: 'Aksesor i ri', accessoryId: cat.accessories[0]?.id ?? '', match: 'any-sash', qtyFormula: '1', enabled: true }] })}
          >
            + Rresht i ri
          </button>
        </div>
      )}

      <div className="sticky-actions">
        <button className="btn primary" onClick={async () => { await db.systems.put(s); onClose(); }}>Ruaj sistemin</button>
        <button className="btn" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  );
}

function ProfileForm({ initial, onClose }: { initial: Profile; onClose: () => void }) {
  const cat = useCatalog();
  const [p, setP] = useState(initial);
  const set = (x: Partial<Profile>) => setP((c) => ({ ...c, ...x }));
  return (
    <Modal title={initial.name ? 'Profili' : 'Profil i ri'} onClose={onClose} wide>
      <div className="grid g3">
        <Field label="Emri"><input value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Kodi"><input value={p.code} onChange={(e) => set({ code: e.target.value })} /></Field>
        <Field label="Sistemi">
          <select value={p.systemId} onChange={(e) => set({ systemId: e.target.value })}>
            {cat.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Kategoria">
          <select value={p.category} onChange={(e) => set({ category: e.target.value })}>
            {cat.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Çmimi i blerjes (për metër)"><NumInput value={p.purchasePerM} min={0} onChange={(v) => set({ purchasePerM: v })} /></Field>
        <Field label="Çmimi i shitjes (për metër)"><NumInput value={p.sellPerM} min={0} onChange={(v) => set({ sellPerM: v })} /></Field>
        <Field label="Gjatësia standarde e shufrës (mm)"><NumInput value={p.barLength} min={1} onChange={(v) => set({ barLength: v })} /></Field>
        <Field label="Gjatësi e personalizuar (mm)" hint="Bosh = përdor standardin"><NumInput value={p.customBarLength} allowEmpty min={0} onChange={(v) => set({ customBarLength: v > 0 ? v : undefined })} /></Field>
        <Field label="Trashësia e sharrës / kerf (mm)"><NumInput value={p.kerf} min={0} onChange={(v) => set({ kerf: v })} /></Field>
        <Field label="Shtesë prerjeje për copë (mm)"><NumInput value={p.cutAllowance} min={0} onChange={(v) => set({ cutAllowance: v })} /></Field>
        <Field label="Humbje / fire (%)" hint="Shtohet në koston e konsumit"><NumInput value={p.wastePct} min={0} onChange={(v) => set({ wastePct: v })} /></Field>
        <Field label="Stoku (shufra)"><NumInput value={p.stock} min={0} onChange={(v) => set({ stock: v })} /></Field>
        <Field label="Furnitori"><input value={p.supplier} onChange={(e) => set({ supplier: e.target.value })} /></Field>
      </div>
      <Field label="Formula teknike (shënim)"><textarea value={p.formulaNote} onChange={(e) => set({ formulaNote: e.target.value })} placeholder="P.sh. gjatësia e prerjes = W – 4 mm (salduar). Formulat llogaritëse janë te Sistemet → Receta." /></Field>
      <Field label="Shënime"><textarea value={p.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!p.name.trim() || !p.systemId} onClick={async () => { await db.profiles.put(p); onClose(); }}>Ruaj</button>
        <button className="btn" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  );
}

export default function Materials() {
  const cat = useCatalog();
  const [tab, setTab] = useState<'sys' | 'prof' | 'glass' | 'acc'>('sys');
  const [sysEdit, setSysEdit] = useState<System | null>(null);
  const [profEdit, setProfEdit] = useState<Profile | null>(null);
  const [profFilter, setProfFilter] = useState('');
  const [glassEdit, setGlassEdit] = useState<GlassType | null>(null);
  const [accEdit, setAccEdit] = useState<Accessory | null>(null);
  const sym = cat.currency.symbol;

  const blankProfile = (): Profile => ({
    id: uid('p'), name: '', code: '', systemId: profFilter || cat.systems[0]?.id || '', category: 'frame', purchasePerM: 0, sellPerM: 0,
    barLength: 6500, kerf: 3, cutAllowance: 0, wastePct: 0, formulaNote: '', stock: 0, supplier: '', notes: ''
  });

  const dupSystem = async (s: System) => {
    const nid = uid('sys');
    const map = new Map<string, string>();
    const profs = cat.profiles.filter((p) => p.systemId === s.id).map((p) => {
      const id = uid('p');
      map.set(p.id, id);
      return { ...p, id, systemId: nid };
    });
    const copy: System = {
      ...JSON.parse(JSON.stringify(s)), id: nid, name: `${s.name} (kopje)`, verified: false,
      recipe: s.recipe.map((l) => ({ ...l, profileId: map.get(l.profileId) ?? l.profileId }))
    };
    await db.transaction('rw', db.systems, db.profiles, async () => {
      await db.systems.add(copy);
      await db.profiles.bulkAdd(profs);
    });
  };

  return (
    <div>
      <div className="row sp"><h1>Databaza e materialeve</h1></div>
      <Tabs
        tabs={[{ key: 'sys', label: 'Sisteme' }, { key: 'prof', label: 'Profile' }, { key: 'glass', label: 'Qelq' }, { key: 'acc', label: 'Aksesorë' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'sys' && (
        <>
          <div className="alert info">
            Çmimet dhe zbritjet teknike janë vlera fillestare 0 – asnjë formulë nuk është e miratuar nga prodhuesi. Plotëso vlerat nga katalogu i sistemit që përdor.
          </div>
          <button
            className="btn gold" style={{ marginBottom: 10 }}
            onClick={async () => {
              const name = window.prompt('Emri i sistemit të ri:');
              if (!name) return;
              const base = cat.systems[0];
              if (!base) return;
              await dupSystem({ ...base, name });
              alert('U krijua si kopje e sistemit të parë. Hape për ta përshtatur.');
            }}
          >
            + Sistem i ri
          </button>
          <div className="grid g2">
            {cat.systems.map((s) => (
              <div key={s.id} className="card">
                <div className="row sp">
                  <h3 style={{ margin: 0 }}>{s.name}</h3>
                  <span className="row"><span className="tag">{s.material === 'pvc' ? 'PVC' : s.material === 'glass' ? 'Xham' : 'Alumin'}</span>{s.verified ? <span className="tag ok">verifikuar</span> : <span className="tag bad">pa verifikuar</span>}</span>
                </div>
                <div className="muted small" style={{ margin: '6px 0' }}>
                  {cat.profiles.filter((p) => p.systemId === s.id).length} profile · {s.recipe.length} rreshta recete · {s.accRecipe.length} rreshta aksesorësh
                </div>
                <div className="row">
                  <button className="btn sm primary" onClick={() => setSysEdit(s)}>Hap / ndrysho</button>
                  <button className="btn sm" onClick={() => dupSystem(s)}>Dyfisho</button>
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      const used = await db.windows.where('systemId').equals(s.id).count();
                      if (used) return alert(`Ky sistem përdoret nga ${used} dritare. Ndrysho sistemin e atyre dritareve para se ta fshish.`);
                      if (!confirmDo(`Fshi sistemin “${s.name}” dhe profilet e tij?`)) return;
                      await db.transaction('rw', db.systems, db.profiles, async () => {
                        await db.profiles.where('systemId').equals(s.id).delete();
                        await db.systems.delete(s.id);
                      });
                    }}
                  >
                    Fshi
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'prof' && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <select style={{ width: 240 }} value={profFilter} onChange={(e) => setProfFilter(e.target.value)}>
              <option value="">Të gjitha sistemet</option>
              {cat.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn gold" onClick={() => setProfEdit(blankProfile())}>+ Profil i ri</button>
          </div>
          <div className="card tbl-wrap">
            <table>
              <thead><tr><th>Profili</th><th>Kodi</th><th>Sistemi</th><th>Kategoria</th><th className="r">Blerje/m</th><th className="r">Shitje/m</th><th className="r">Shufra mm</th><th className="r">Kerf</th><th className="r">Stok</th><th /></tr></thead>
              <tbody>
                {cat.profiles.filter((p) => !profFilter || p.systemId === profFilter).map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td><td>{p.code}</td>
                    <td>{cat.ctx.systems.get(p.systemId)?.name}</td>
                    <td>{cat.categories.find((c) => c.key === p.category)?.label ?? p.category}</td>
                    <td className="r">{money(p.purchasePerM, sym)}</td><td className="r">{money(p.sellPerM, sym)}</td>
                    <td className="r">{effBarLength(p)}</td><td className="r">{p.kerf}</td><td className="r">{p.stock}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setProfEdit(p)}>Ndrysho</button>{' '}
                      <button className="btn sm" onClick={() => db.profiles.add({ ...p, id: uid('p'), name: `${p.name} (kopje)` })}>Dyfisho</button>{' '}
                      <button
                        className="btn sm danger"
                        onClick={async () => {
                          const inUse = cat.systems.some((s) => s.recipe.some((l) => l.profileId === p.id));
                          if (inUse && !confirmDo('Ky profil përdoret në receta. Rreshtat përkatës do të japin gabim derisa të rikonfigurohen. Vazhdo?')) return;
                          if (!inUse && !confirmDo(`Fshi “${p.name}”?`)) return;
                          await db.profiles.delete(p.id);
                        }}
                      >
                        Fshi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'glass' && (
        <>
          <button className="btn gold" style={{ marginBottom: 10 }} onClick={() => setGlassEdit({ id: uid('g'), name: '', composition: '', kind: 'Dopio xham', thickness: 24, supplier: '', purchasePerM2: 0, sellPerM2: 0, minArea: 0, notes: '' })}>+ Lloj qelqi</button>
          <div className="card tbl-wrap">
            <table>
              <thead><tr><th>Emri</th><th>Përbërja</th><th>Lloji</th><th className="r">mm</th><th>Furnitori</th><th className="r">Blerje/m²</th><th className="r">Shitje/m²</th><th /></tr></thead>
              <tbody>
                {cat.glassTypes.map((g) => (
                  <tr key={g.id}>
                    <td><b>{g.name}</b></td><td>{g.composition}</td><td>{g.kind}</td><td className="r">{g.thickness}</td><td>{g.supplier}</td>
                    <td className="r">{money(g.purchasePerM2, sym)}</td><td className="r">{money(g.sellPerM2, sym)}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setGlassEdit(g)}>Ndrysho</button>{' '}
                      <button className="btn sm" onClick={() => db.glassTypes.add({ ...g, id: uid('g'), name: `${g.name} (kopje)` })}>Dyfisho</button>{' '}
                      <button
                        className="btn sm danger"
                        onClick={async () => {
                          const used = (await db.windows.toArray()).filter((w) => w.glassId === g.id || Object.values(w.cellGlass).includes(g.id)).length;
                          if (used) return alert(`Ky qelq përdoret nga ${used} dritare.`);
                          if (confirmDo(`Fshi “${g.name}”?`)) await db.glassTypes.delete(g.id);
                        }}
                      >
                        Fshi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint">Për furnitorë të ndryshëm me çmime të ndryshme, dyfisho llojin e qelqit dhe vendos furnitorin e ri me çmimin e tij.</div>
        </>
      )}

      {tab === 'acc' && (
        <>
          <button className="btn gold" style={{ marginBottom: 10 }} onClick={() => setAccEdit({ id: uid('acc'), name: '', unit: 'copë', purchase: 0, sell: 0, stock: 0, supplier: '', notes: '' })}>+ Aksesor</button>
          <div className="card tbl-wrap">
            <table>
              <thead><tr><th>Emri</th><th>Njësia</th><th className="r">Blerje</th><th className="r">Shitje</th><th className="r">Stok</th><th>Furnitori</th><th /></tr></thead>
              <tbody>
                {cat.accessories.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.name}</b></td><td>{a.unit}</td>
                    <td className="r">{money(a.purchase, sym)}</td><td className="r">{money(a.sell, sym)}</td><td className="r">{a.stock}</td><td>{a.supplier}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setAccEdit(a)}>Ndrysho</button>{' '}
                      <button className="btn sm" onClick={() => db.accessories.add({ ...a, id: uid('acc'), name: `${a.name} (kopje)` })}>Dyfisho</button>{' '}
                      <button className="btn sm danger" onClick={async () => confirmDo(`Fshi “${a.name}”?`) && db.accessories.delete(a.id)}>Fshi</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sysEdit && <SystemEditor sys={sysEdit} onClose={() => setSysEdit(null)} />}
      {profEdit && <ProfileForm initial={profEdit} onClose={() => setProfEdit(null)} />}
      {glassEdit && (
        <Modal title="Qelq" onClose={() => setGlassEdit(null)}>
          <GlassForm g={glassEdit} onClose={() => setGlassEdit(null)} />
        </Modal>
      )}
      {accEdit && (
        <Modal title="Aksesor" onClose={() => setAccEdit(null)}>
          <AccForm a={accEdit} onClose={() => setAccEdit(null)} />
        </Modal>
      )}
    </div>
  );
}

function GlassForm({ g: init, onClose }: { g: GlassType; onClose: () => void }) {
  const [g, setG] = useState(init);
  const set = (p: Partial<GlassType>) => setG((c) => ({ ...c, ...p }));
  return (
    <>
      <div className="grid g2">
        <Field label="Emri"><input value={g.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Lloji">
          <input list="glass-kinds" value={g.kind} onChange={(e) => set({ kind: e.target.value })} />
          <datalist id="glass-kinds">
            {['Xham i thjeshtë', 'Dopio xham', 'Triple xham', 'Laminuar (Triplex)', 'I kalitur', 'Termik', 'Transparent', 'I mbrujtur', 'Kompozim i personalizuar'].map((k) => <option key={k} value={k} />)}
          </datalist>
        </Field>
        <Field label="Përbërja (p.sh. 4+16+4)"><input value={g.composition} onChange={(e) => set({ composition: e.target.value })} /></Field>
        <Field label="Trashësia totale (mm)"><NumInput value={g.thickness} min={0} onChange={(v) => set({ thickness: v })} /></Field>
        <Field label="Furnitori"><input value={g.supplier} onChange={(e) => set({ supplier: e.target.value })} /></Field>
        <Field label="Sipërfaqja minimale e faturuar (m²)"><NumInput value={g.minArea} min={0} onChange={(v) => set({ minArea: v })} /></Field>
        <Field label="Çmimi i blerjes (për m²)"><NumInput value={g.purchasePerM2} min={0} onChange={(v) => set({ purchasePerM2: v })} /></Field>
        <Field label="Çmimi i shitjes (për m²)"><NumInput value={g.sellPerM2} min={0} onChange={(v) => set({ sellPerM2: v })} /></Field>
      </div>
      <Field label="Shënime"><textarea value={g.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!g.name.trim()} onClick={async () => { await db.glassTypes.put(g); onClose(); }}>Ruaj</button>
        <button className="btn" onClick={onClose}>Anulo</button>
      </div>
    </>
  );
}

function AccForm({ a: init, onClose }: { a: Accessory; onClose: () => void }) {
  const [a, setA] = useState(init);
  const set = (p: Partial<Accessory>) => setA((c) => ({ ...c, ...p }));
  return (
    <>
      <div className="grid g2">
        <Field label="Emri"><input value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Njësia"><input value={a.unit} onChange={(e) => set({ unit: e.target.value })} /></Field>
        <Field label="Çmimi i blerjes"><NumInput value={a.purchase} min={0} onChange={(v) => set({ purchase: v })} /></Field>
        <Field label="Çmimi i shitjes"><NumInput value={a.sell} min={0} onChange={(v) => set({ sell: v })} /></Field>
        <Field label="Stoku"><NumInput value={a.stock} min={0} onChange={(v) => set({ stock: v })} /></Field>
        <Field label="Furnitori"><input value={a.supplier} onChange={(e) => set({ supplier: e.target.value })} /></Field>
      </div>
      <Field label="Shënime"><textarea value={a.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!a.name.trim()} onClick={async () => { await db.accessories.put(a); onClose(); }}>Ruaj</button>
        <button className="btn" onClick={onClose}>Anulo</button>
      </div>
    </>
  );
}
