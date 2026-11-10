import { useEffect, useRef, useState } from 'react';
import { exportAll, importAll, resetEverything, setSetting, TABLES, validateBackup, db } from '../db';
import { useCatalog } from '../lib/data';
import { Field, NumInput, Tabs, confirmDo } from '../components/ui';
import { download, todayISO, uid } from '../lib/format';
import { connect, disconnect, getSyncState, onSyncState, replaceCloudWithLocal, syncLinked, syncNow, type SyncState } from '../sync/engine';
import * as syncApi from '../sync/client';
import { DEFAULT_SHUTTER_RATES } from '../types';

function CloudPanel() {
  const [st, setSt] = useState<SyncState>(getSyncState());
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [choice, setChoice] = useState(false);
  useEffect(() => onSyncState(setSt), []);
  const linked = syncLinked();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setInfo('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const login = (mode: 'auto' | 'cloud' | 'local') => run(async () => {
    const r = await connect(email.trim(), pw, mode);
    if (r === 'need-choice') setChoice(true); else { setChoice(false); setPw(''); setInfo('Pajisja u lidh me cloud.'); }
  });
  const signup = () => run(async () => {
    const s = await syncApi.signUp(email.trim(), pw);
    if (!s) { setInfo('Llogaria u krijua. Hap lidhjen e konfirmimit që të erdhi në email, pastaj shtyp “Hyr”.'); return; }
    const r = await connect(email.trim(), pw, 'auto');
    if (r === 'need-choice') setChoice(true); else { setPw(''); setInfo('Llogaria u krijua dhe pajisja u lidh.'); }
  });

  if (linked) {
    return (
      <div className="card">
        <h2>Cloud</h2>
        <div className={'alert ' + (st.status === 'error' ? 'err' : 'info')}>
          {st.status === 'error' ? `Gabim: ${st.message}` : st.status === 'syncing' ? 'Duke sinkronizuar…' : `Lidhur si ${st.email || syncApi.loadSession()?.email}. ${st.last ? 'Sinkronizimi i fundit: ' + new Date(st.last).toLocaleString('sq-AL') : ''}`}
        </div>
        <p className="muted">Çdo ndryshim ruhet edhe në cloud dhe del në pajisjet e tjera pas pak sekondash. Pa internet punon normalisht dhe sinkronizon kur lidhet.</p>
        <div className="row">
          <button className="btn primary" disabled={st.status === 'syncing'} onClick={() => syncNow()}>Sinkronizo tani</button>
          <button className="btn danger" onClick={async () => { if (confirmDo('Dil nga cloud? Të dhënat mbeten në këtë pajisje dhe në cloud.')) await disconnect(); setSt(getSyncState()); }}>Dil</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Cloud (sinkronizim mes pajisjeve)</h2>
      <p className="muted">Hyr me një llogari për të parë të njëjtat të dhëna në telefon dhe në kompjuter. Të dhënat e secilit mbrohen me llogarinë e tij.</p>
      {err && <div className="alert err">{err}</div>}
      {info && <div className="alert info">{info}</div>}
      {choice ? (
        <div>
          <div className="alert warn">Në cloud ka tashmë të dhëna dhe edhe në këtë pajisje ka projekte. Zgjidh çfarë mbetet. Rekomandohet të bësh më parë një kopje rezervë (skeda “Kopje rezervë”).</div>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={() => confirmDo('Të dhënat e kësaj pajisjeje do të ZËVENDËSOHEN me ato të cloud. Vazhdo?') && login('cloud')}>Përdor të dhënat e cloud (zëvendëson këtë pajisje)</button>
            <button className="btn danger" disabled={busy} onClick={() => confirmDo('Të dhënat e cloud do të përzihen me këto të pajisjes (rreshtat me të njëjtin id mbishkruhen). Vazhdo?') && login('local')}>Ngarko këtë pajisje në cloud</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid g2">
            <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Fjalëkalimi (min. 6 shkronja)"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy || !email || pw.length < 6} onClick={() => login('auto')}>Hyr</button>
            <button className="btn" disabled={busy || !email || pw.length < 6} onClick={signup}>Krijo llogari të re</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const cat = useCatalog();
  const [tab, setTab] = useState<'biz' | 'quote' | 'rates' | 'lists' | 'look' | 'cloud' | 'backup'>('biz');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const b = cat.business;

  const doExport = async () => {
    const data = await exportAll();
    download(`gz-aluminium-backup-${todayISO()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    await setSetting('lastBackup', Date.now());
    setMsg({ t: 'ok', s: 'Kopja rezervë u shkarkua. Ruaje në iCloud/Google Drive ose dërgoje me email.' });
  };

  const doImport = async (f: File) => {
    try {
      const obj = JSON.parse(await f.text());
      const err = validateBackup(obj);
      if (err) return setMsg({ t: 'err', s: err });
      const d = obj.data;
      const summary = `${d.projects.length} projekte, ${d.windows.length} dritare, ${d.quotations.length} oferta, ${d.profiles.length} profile`;
      if (!confirmDo(`KUJDES: kjo do të ZËVENDËSOJË të gjitha të dhënat aktuale me kopjen rezervë (${summary}, eksportuar ${String(obj.exportedAt).slice(0, 10)}). Vazhdo?`)) return;
      await importAll(obj);
      if (syncLinked()) await replaceCloudWithLocal();
      setMsg({ t: 'ok', s: `U rikthye me sukses: ${summary}.` });
    } catch (e) {
      setMsg({ t: 'err', s: `Importi dështoi: ${(e as Error).message}` });
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div>
      <h1>Cilësimet dhe kopja rezervë</h1>
      <Tabs
        tabs={[
          { key: 'biz', label: 'Biznesi' }, { key: 'quote', label: 'Oferta dhe PDF' }, { key: 'rates', label: 'Punë krahu' },
          { key: 'lists', label: 'Ngjyra dhe kategori' }, { key: 'look', label: 'Pamja' }, { key: 'cloud', label: 'Cloud' }, { key: 'backup', label: 'Kopje rezervë' }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'biz' && (
        <div className="card">
          <div className="grid g2">
            <Field label="Emri i biznesit"><input value={b.name} onChange={(e) => setSetting('business', { ...b, name: e.target.value })} /></Field>
            <Field label="NIPT"><input value={b.nipt} onChange={(e) => setSetting('business', { ...b, nipt: e.target.value })} /></Field>
            <Field label="Email"><input value={b.email} onChange={(e) => setSetting('business', { ...b, email: e.target.value })} /></Field>
            <Field label="Telefoni"><input value={b.phone} onChange={(e) => setSetting('business', { ...b, phone: e.target.value })} /></Field>
            <Field label="Instagram"><input value={b.instagram} onChange={(e) => setSetting('business', { ...b, instagram: e.target.value })} /></Field>
            <Field label="Adresa (opsionale)"><input value={b.address} onChange={(e) => setSetting('business', { ...b, address: e.target.value })} /></Field>
            <Field label="Ofertuesi (emri në nënshkrim)"><input value={b.signer} onChange={(e) => setSetting('business', { ...b, signer: e.target.value })} /></Field>
            <Field label="Monedha (simboli në çmime)"><input value={cat.currency.symbol} onChange={(e) => setSetting('currency', { ...cat.currency, symbol: e.target.value })} /></Field>
          </div>
          <div className="hint">Ndryshimet ruhen automatikisht. Ofertat e lëshuara ruajnë të dhënat e biznesit të kohës kur u krijuan.</div>
        </div>
      )}

      {tab === 'quote' && (
        <div className="card">
          <div className="grid g2">
            <Field label="Vlefshmëria e ofertës (ditë)"><NumInput value={cat.quote.validityDays} min={1} step={1} onChange={(v) => setSetting('quote', { ...cat.quote, validityDays: v })} /></Field>
            <Field label="TVSH e parazgjedhur (%)"><NumInput value={cat.quote.vatPct} min={0} onChange={(v) => setSetting('quote', { ...cat.quote, vatPct: v })} /></Field>
            <Field label="Ngjyra e theksit në PDF"><input type="color" value={cat.pdf.accent} onChange={(e) => setSetting('pdf', { ...cat.pdf, accent: e.target.value })} /></Field>
            <Field label="Ngjyra e kokës së PDF"><input type="color" value={cat.pdf.navy} onChange={(e) => setSetting('pdf', { ...cat.pdf, navy: e.target.value })} /></Field>
          </div>
          <label className="chk"><input type="checkbox" checked={cat.quote.showDrawings} onChange={(e) => setSetting('quote', { ...cat.quote, showDrawings: e.target.checked })} /> Vizatimet 2D të përfshira si parazgjedhje</label>
          <Field label="Kushtet e pagesës (parazgjedhje)"><textarea value={cat.quote.payment} onChange={(e) => setSetting('quote', { ...cat.quote, payment: e.target.value })} /></Field>
          <Field label="Shënime të parazgjedhura në ofertë"><textarea value={cat.quote.notes} onChange={(e) => setSetting('quote', { ...cat.quote, notes: e.target.value })} /></Field>
          <Field label="Rresht shtesë në fund të faqes së PDF"><input value={cat.pdf.footer} onChange={(e) => setSetting('pdf', { ...cat.pdf, footer: e.target.value })} /></Field>
        </div>
      )}

      {tab === 'rates' && (
        <div className="card">
          <h2>Tarifat e punës (kosto)</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Emri</th><th>Njësia</th><th>Tarifa ({cat.currency.symbol})</th><th>Parazgjedhur</th><th /></tr></thead>
              <tbody>
                {cat.laborRates.map((l, i) => {
                  const up = (p: Partial<typeof l>) => setSetting('laborRates', cat.laborRates.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  return (
                    <tr key={l.id}>
                      <td><input value={l.name} onChange={(e) => up({ name: e.target.value })} /></td>
                      <td>
                        <select value={l.unit} onChange={(e) => up({ unit: e.target.value as 'm2' | 'window' | 'ml' })}>
                          <option value="m2">për m²</option><option value="window">për copë</option><option value="ml">për ml perimetër</option>
                        </select>
                      </td>
                      <td><NumInput value={l.rate} min={0} onChange={(v) => up({ rate: v })} /></td>
                      <td><input type="checkbox" checked={l.defaultOn} onChange={(e) => up({ defaultOn: e.target.checked })} /></td>
                      <td><button className="btn sm danger" onClick={() => setSetting('laborRates', cat.laborRates.filter((_, j) => j !== i))}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setSetting('laborRates', [...cat.laborRates, { id: uid('l'), name: 'Tarifë e re', unit: 'm2', rate: 0, defaultOn: false }])}>+ Tarifë</button>
          <div className="hint">“Parazgjedhur” vlen për dritaret e reja. Për dritaret ekzistuese zgjidhet te dritarja → Kostoja dhe çmimi.</div>
        </div>
      )}

      {tab === 'rates' && (
        <div className="card">
          <h2>Roletë rrotulluese dhe rrjeta (çmime)</h2>
          {(() => {
            const r = { ...DEFAULT_SHUTTER_RATES, ...(cat.ctx.shutter ?? {}) };
            const up = (p: Partial<typeof r>) => setSetting('shutter', { ...r, ...p });
            return (
              <div className="grid g2">
                <Field label={`Roleta: kosto për m² (${cat.currency.symbol})`}><NumInput value={r.costM2} min={0} onChange={(v) => up({ costM2: v })} /></Field>
                <Field label={`Roleta: çmim shitjeje për m² (${cat.currency.symbol})`}><NumInput value={r.sellM2} min={0} onChange={(v) => up({ sellM2: v })} /></Field>
                <Field label={`Motori: kosto (${cat.currency.symbol})`}><NumInput value={r.motorCost} min={0} onChange={(v) => up({ motorCost: v })} /></Field>
                <Field label={`Motori: çmim shitjeje (${cat.currency.symbol})`}><NumInput value={r.motorSell} min={0} onChange={(v) => up({ motorSell: v })} /></Field>
                <Field label="Sipërfaqja minimale e roletës (m²)"><NumInput value={r.minArea} min={0} onChange={(v) => up({ minArea: v })} /></Field>
                <span />
                <Field label={`Rrjeta: kosto për m² (${cat.currency.symbol})`}><NumInput value={r.netCostM2} min={0} onChange={(v) => up({ netCostM2: v })} /></Field>
                <Field label={`Rrjeta: çmim shitjeje për m² (${cat.currency.symbol})`}><NumInput value={r.netSellM2} min={0} onChange={(v) => up({ netSellM2: v })} /></Field>
              </div>
            );
          })()}
          <div className="hint">Roleta llogaritet sipas gjerësisë × lartësisë së dritares; rrjeta sipas hapjes së pjesëve të zgjedhura. Çmimet fillojnë me 0: plotësoji ti.</div>
        </div>
      )}

      {tab === 'lists' && (
        <div className="grid g2">
          <div className="card">
            <h2>Ngjyrat</h2>
            {cat.colors.map((c, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap', marginBottom: 6 }}>
                <input type="color" style={{ width: 54, padding: 2 }} value={c.hex} onChange={(e) => setSetting('colors', cat.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
                <input value={c.name} onChange={(e) => setSetting('colors', cat.colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <button className="btn sm danger" onClick={() => setSetting('colors', cat.colors.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button className="btn sm" onClick={() => setSetting('colors', [...cat.colors, { name: 'Ngjyrë e re', hex: '#cccccc' }])}>+ Ngjyrë</button>
          </div>
          <div className="card">
            <h2>Kategoritë e profileve</h2>
            {cat.categories.map((c, i) => (
              <div key={c.key} className="row" style={{ flexWrap: 'nowrap', marginBottom: 6 }}>
                <input value={c.label} onChange={(e) => setSetting('categories', cat.categories.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <select style={{ width: 170 }} value={c.group} onChange={(e) => setSetting('categories', cat.categories.map((x, j) => (j === i ? { ...x, group: e.target.value as 'profile' | 'reinforcement' | 'gasket' } : x)))}>
                  <option value="profile">Profile</option><option value="reinforcement">Armaturë</option><option value="gasket">Garnitura / ndihmës</option>
                </select>
                <button className="btn sm danger" onClick={async () => {
                  if ((await db.profiles.toArray()).some((p) => p.category === c.key)) return alert('Kjo kategori përdoret nga profile.');
                  setSetting('categories', cat.categories.filter((_, j) => j !== i));
                }}>✕</button>
              </div>
            ))}
            <button className="btn sm" onClick={() => setSetting('categories', [...cat.categories, { key: uid('cat'), label: 'Kategori e re', group: 'profile' }])}>+ Kategori</button>
            <div className="hint">Grupi përcakton ku llogaritet kostoja (profile / armaturë / garnitura).</div>
          </div>
        </div>
      )}

      {tab === 'look' && (
        <div className="card">
          <label className="chk"><input type="checkbox" checked={cat.appearance.bigButtons} onChange={(e) => setSetting('appearance', { ...cat.appearance, bigButtons: e.target.checked })} /> Butona dhe tekst më të mëdhenj (për iPhone/iPad)</label>
          <label className="chk"><input type="checkbox" checked={cat.appearance.theme === 'light'} onChange={(e) => setSetting('appearance', { ...cat.appearance, theme: e.target.checked ? 'light' : 'dark' })} /> Menu e çelët në vend të asaj të errët</label>
        </div>
      )}

      {tab === 'cloud' && <CloudPanel />}

      {tab === 'backup' && (
        <div className="card">
          {msg && <div className={'alert ' + (msg.t === 'ok' ? 'info' : 'err')}>{msg.s}</div>}
          <h2>Eksporto</h2>
          <p className="muted">Shkarkon një skedar JSON me të gjitha të dhënat (projekte, dritare, materiale, oferta, cilësime).</p>
          <button className="btn primary" onClick={doExport}>Shkarko kopjen rezervë (JSON)</button>
          <h2 style={{ marginTop: 20 }}>Importo</h2>
          <p className="muted">Skedari validohet para importit. Të dhënat aktuale zëvendësohen plotësisht pas konfirmimit.</p>
          <input ref={file} type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <h2 style={{ marginTop: 20 }}>Zona e rrezikshme</h2>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirmDo('Do të fshihen TË GJITHA të dhënat dhe do të rikthehen vlerat fillestare. Ke bërë kopje rezervë?')) return;
              if (!confirmDo('Konfirmo edhe një herë: fshij gjithçka?')) return;
              await resetEverything();
              if (syncLinked()) await replaceCloudWithLocal();
              setMsg({ t: 'ok', s: 'Të dhënat u rivendosën.' });
            }}
          >
            Fshi gjithçka dhe rivendos
          </button>
          <div className="hint" style={{ marginTop: 10 }}>Tabelat e përfshira: {TABLES.join(', ')}.</div>
        </div>
      )}
    </div>
  );
}
