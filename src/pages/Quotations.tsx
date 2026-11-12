import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { Field, Modal, NumInput, Stat, confirmDo } from '../components/ui';
import { QUOTE_STATUSES, QuotationRec, makeItems, nextNumber, quoteTotals, snapshotQuotation } from '../lib/quotation';
import { buildQuotationPdf } from '../lib/pdf';
import { preloadPanelImages } from '../lib/panelImages';
import { fmtDate, money, num } from '../lib/format';

export function QuotationsPage() {
  const nav = useNavigate();
  const cat = useCatalog();
  const quotes = useLiveQuery(() => db.quotations.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState('');
  const sym = cat.currency.symbol;

  const create = async () => {
    const p = projects.find((x) => x.id === Number(pid));
    if (!p) return;
    const ws = await db.windows.where('projectId').equals(p.id!).sortBy('order');
    if (!ws.length) return alert('Projekti nuk ka dritare.');
    const q = snapshotQuotation(p, ws, cat.ctx, cat.colors, cat.business, cat.quote, nextNumber(quotes.map((x) => x.number)));
    const id = await db.quotations.add(q);
    nav(`/quotations/${id}`);
  };

  return (
    <div>
      <div className="row sp">
        <h1>Ofertat</h1>
        <button className="btn gold" onClick={() => setOpen(true)}>+ Ofertë e re</button>
      </div>
      <div className="row" style={{ margin: '10px 0' }}>
        <select style={{ width: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Të gjitha statuset</option>
          {QUOTE_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="card tbl-wrap">
        <table>
          <thead><tr><th>Nr.</th><th>Data</th><th>Klienti</th><th>Projekti</th><th>Statusi</th><th className="r">Totali</th></tr></thead>
          <tbody>
            {quotes.filter((q) => !status || q.status === status).map((q) => (
              <tr key={q.id} className="click" onClick={() => nav(`/quotations/${q.id}`)}>
                <td><b>{q.number}</b></td><td>{fmtDate(q.date)}</td><td>{q.client.name}</td><td>{q.projectName}</td>
                <td><span className={'tag ' + (q.status === 'Draft' ? '' : 'gold')}>{q.status}</span></td>
                <td className="r">{money(quoteTotals(q).grand, sym)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes.length === 0 && <div className="empty">Asnjë ofertë. Krijo një nga një projekt.</div>}
      </div>
      {open && (
        <Modal title="Ofertë e re" onClose={() => setOpen(false)}>
          <Field label="Projekti">
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">— zgjidh —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)}
            </select>
          </Field>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={!pid} onClick={create}>Krijo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function QuotationEditor() {
  const { id } = useParams();
  const qid = Number(id);
  const nav = useNavigate();
  const cat = useCatalog();
  const [q, setQ] = useState<QuotationRec | null>(null);
  const [saved, setSaved] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPrices, setPdfPrices] = useState(true);
  const [pdfErr, setPdfErr] = useState('');
  const loaded = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    db.quotations.get(qid).then((x) => {
      if (x) setQ(x);
      loaded.current = true;
    });
  }, [qid]);

  const latest = useRef<QuotationRec | null>(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (!q || !loaded.current) return;
    latest.current = q;
    if (first.current) { first.current = false; return; }
    dirty.current = true;
    setSaved(false);
    const t = setTimeout(async () => { await db.quotations.put(q); dirty.current = false; setSaved(true); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => () => {
    if (dirty.current && latest.current) db.quotations.put(latest.current);
  }, []);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  // door panel pictures must be loaded before the (synchronous) PDF is built
  useEffect(() => {
    if (q) preloadPanelImages(q.items.map((it) => it.win.panel?.file ?? '').filter(Boolean));
  }, [q?.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const tot = useMemo(() => (q ? quoteTotals(q) : null), [q]);
  if (!q || !tot) return <div className="empty">Duke ngarkuar…</div>;
  const sym = cat.currency.symbol;
  const draft = q.status === 'Draft';
  const upd = (p: Partial<QuotationRec>) => setQ((c) => (c ? { ...c, ...p } : c));
  const makePdf = (prices: boolean) => buildQuotationPdf(q, { ...cat.pdf, symbol: sym }, prices);
  const fname = (prices: boolean) => `Oferta-${q.number}${prices ? '' : '-teknike'}.pdf`;

  const guard = (fn: () => void | Promise<void>) => {
    setPdfErr('');
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((e) => setPdfErr(`Gabim me PDF: ${(e as Error).message}`));
    } catch (e) {
      console.error(e);
      setPdfErr(`Gabim gjatë krijimit të PDF: ${(e as Error).message}`);
    }
  };
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const preview = (prices: boolean) => guard(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfPrices(prices);
    setPdfUrl(URL.createObjectURL(makePdf(prices).output('blob')));
  });
  /** Download: share sheet (Save to Files) where possible, new tab on iPhone, normal download elsewhere. */
  const download = (prices: boolean) => guard(async () => {
    const doc = makePdf(prices);
    const blob = doc.output('blob');
    const file = new File([blob], fname(prices), { type: 'application/pdf' });
    const nv = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (isIOS() || !('download' in document.createElement('a'))) {
      if (nv.canShare?.({ files: [file] })) {
        try { await nv.share({ files: [file], title: `Oferta ${q.number}` }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      if (!window.open(url, '_blank')) window.location.href = url;
      return;
    }
    doc.save(fname(prices));
  });
  const print = (prices: boolean) => guard(() => {
    const url = URL.createObjectURL(makePdf(prices).output('blob'));
    if (isIOS()) {
      if (!window.open(url, '_blank')) window.location.href = url;
      return;
    }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.src = url;
    f.onload = () => {
      try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { window.open(url, '_blank'); }
      setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    document.body.appendChild(f);
  });
  const share = (prices: boolean) => guard(async () => {
    const blob = makePdf(prices).output('blob');
    const file = new File([blob], fname(prices), { type: 'application/pdf' });
    const nv = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nv.canShare?.({ files: [file] })) {
      try { await nv.share({ files: [file], title: `Oferta ${q.number}` }); } catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
    } else {
      download(prices);
    }
  });

  const issue = async () => {
    if (q.items.some((i) => i.calc.errors.length)) {
      if (!confirmDo('Disa pozicione kanë gabime llogaritjeje. Të lëshohet megjithatë?')) return;
    }
    if (!confirmDo('Pas lëshimit oferta bllokohet (çmimet dhe materialet ruhen si pamje e përhershme). Vazhdo?')) return;
    upd({ status: 'Lëshuar', issuedAt: Date.now() });
  };

  const refresh = async () => {
    if (!confirmDo('Do të rillogariten pozicionet nga projekti me çmimet AKTUALE të materialeve. Përshkrimet dhe çmimet e ndryshuara manualisht zëvendësohen. Vazhdo?')) return;
    const p = await db.projects.get(q.projectId);
    const ws = await db.windows.where('projectId').equals(q.projectId).sortBy('order');
    if (!p) return alert('Projekti nuk ekziston më.');
    upd({
      items: makeItems(ws, cat.ctx, cat.colors),
      client: { name: p.clientName, phone: p.phone, email: p.email, address: p.address },
      projectName: p.name
    });
  };

  const duplicate = async () => {
    const all = await db.quotations.toArray();
    const { id: _i, ...rest } = q;
    void _i;
    const nid = await db.quotations.add({
      ...JSON.parse(JSON.stringify(rest)), number: nextNumber(all.map((x) => x.number)), status: 'Draft',
      date: new Date().toISOString().slice(0, 10), createdAt: Date.now(), issuedAt: undefined
    });
    nav(`/quotations/${nid}`);
  };

  return (
    <div>
      <div className="row sp">
        <div className="row"><Link to="/quotations" className="btn sm">← Ofertat</Link><h1 style={{ margin: 0 }}>Oferta {q.number}</h1>
          <span className={'tag ' + (draft ? '' : 'gold')}>{q.status}</span>{draft && <span className={'tag ' + (saved ? 'ok' : 'gold')}>{saved ? 'U ruajt' : 'Duke ruajtur…'}</span>}
        </div>
        <div className="row">
          <button className="btn" onClick={duplicate}>Dyfisho</button>
          <button
            className="btn danger"
            onClick={async () => { if (confirmDo(`Fshi ofertën ${q.number}?`)) { await db.quotations.delete(qid); nav('/quotations'); } }}
          >
            Fshi
          </button>
        </div>
      </div>

      <div className="grid g4 keep2" style={{ margin: '12px 0' }}>
        <Stat label="Totali i ofertës" value={money(tot.grand, sym)} />
        <Stat label="Kosto totale" value={money(tot.cost, sym)} />
        <Stat label="Fitimi (i brendshëm)" value={money(tot.profit, sym)} tone={tot.profit >= 0 ? 'pos' : 'neg'} />
        <Stat label="Njësi / m²" value={`${tot.units} / ${num(tot.area, 2)}`} />
      </div>

      <div className="card">
        <h2>PDF</h2>
        {pdfErr && <div className="alert err">{pdfErr}</div>}
        <div className="row">
          <button className="btn primary" onClick={() => preview(q.showPrices)}>Shiko PDF</button>
          <button className="btn" onClick={() => download(q.showPrices)}>Shkarko</button>
          <button className="btn" onClick={() => print(q.showPrices)}>Printo</button>
          <button className="btn" onClick={() => share(q.showPrices)}>Ndaj (iPhone)</button>
          <button className="btn" onClick={() => preview(false)}>PDF teknik pa çmime</button>
          {draft && <button className="btn gold" onClick={issue}>Lësho ofertën</button>}
          {draft && <button className="btn" onClick={refresh}>↻ Rifresko nga projekti</button>}
          {!draft && (
            <select style={{ width: 160 }} value={q.status} onChange={(e) => upd({ status: e.target.value as QuotationRec['status'] })}>
              {QUOTE_STATUSES.filter((s) => s !== 'Draft').map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
        </div>
        {!draft && <div className="hint" style={{ marginTop: 8 }}>Oferta e lëshuar është e bllokuar: çmimet dhe llogaritjet ruhen siç ishin në momentin e krijimit; ndryshimet në databazë nuk e ndikojnë. Përdor “Dyfisho” për version të ri.</div>}
      </div>

      <div className="card">
        <h2>Të dhënat e ofertës</h2>
        <div className="grid g3">
          <Field label="Klienti"><input disabled={!draft} value={q.client.name} onChange={(e) => upd({ client: { ...q.client, name: e.target.value } })} /></Field>
          <Field label="Telefoni"><input disabled={!draft} value={q.client.phone} onChange={(e) => upd({ client: { ...q.client, phone: e.target.value } })} /></Field>
          <Field label="Email"><input disabled={!draft} value={q.client.email} onChange={(e) => upd({ client: { ...q.client, email: e.target.value } })} /></Field>
          <Field label="Adresa"><input disabled={!draft} value={q.client.address} onChange={(e) => upd({ client: { ...q.client, address: e.target.value } })} /></Field>
          <Field label="Projekti"><input disabled={!draft} value={q.projectName} onChange={(e) => upd({ projectName: e.target.value })} /></Field>
          <Field label="Data"><input disabled={!draft} type="date" value={q.date} onChange={(e) => upd({ date: e.target.value })} /></Field>
          <Field label="Vlefshmëria (ditë)"><NumInput disabled={!draft} value={q.validityDays} min={1} step={1} onChange={(v) => upd({ validityDays: v })} /></Field>
          <Field label="Zbritje (%)"><NumInput disabled={!draft} value={q.discountPct} min={0} max={100} onChange={(v) => upd({ discountPct: v })} /></Field>
          <Field label="TVSH (%)"><NumInput disabled={!draft} value={q.vatPct} min={0} max={100} onChange={(v) => upd({ vatPct: v })} /></Field>
        </div>
        <div className="row">
          <label className="chk"><input disabled={!draft} type="checkbox" checked={q.showPrices} onChange={(e) => upd({ showPrices: e.target.checked })} /> Shfaq çmimet në PDF</label>
          <label className="chk"><input disabled={!draft} type="checkbox" checked={q.showDrawings} onChange={(e) => upd({ showDrawings: e.target.checked })} /> Shfaq vizatimet 2D</label>
        </div>
        <Field label="Kushtet e pagesës"><textarea disabled={!draft} value={q.payment} onChange={(e) => upd({ payment: e.target.value })} /></Field>
        <Field label="Shënime"><textarea disabled={!draft} value={q.notes} onChange={(e) => upd({ notes: e.target.value })} /></Field>
      </div>

      <div className="card">
        <h2>Pozicionet</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Poz.</th><th>Përmasat</th><th>Përshkrimi (në PDF)</th><th className="r">Copë</th><th className="r">Totali ({sym})</th><th className="r">Kosto</th></tr></thead>
            <tbody>
              {q.items.map((it, i) => (
                <tr key={i}>
                  <td><b>{it.win.name}</b></td>
                  <td>{it.win.width}×{it.win.height}</td>
                  <td style={{ minWidth: 260 }}>
                    <textarea disabled={!draft} style={{ minHeight: 60 }} value={it.desc} onChange={(e) => upd({ items: q.items.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} />
                    {it.calc.errors.length > 0 && <div className="tag bad">gabime në llogaritje</div>}
                  </td>
                  <td className="r">{it.win.qty}</td>
                  <td className="r" style={{ width: 140 }}>
                    <NumInput disabled={!draft} value={it.price} min={0} onChange={(v) => upd({ items: q.items.map((x, j) => (j === i ? { ...x, price: v } : x)) })} />
                  </td>
                  <td className="r">{money(it.calc.costs.total, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pdfUrl && (
        <Modal title={`PDF ${q.number}${pdfPrices ? '' : ' (teknik)'}`} onClose={() => { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }} wide>
          <div className="row" style={{ marginBottom: 8 }}>
            <a className="btn sm" href={pdfUrl} target="_blank" rel="noreferrer">Hap në skedë të re</a>
            <button className="btn sm" onClick={() => download(pdfPrices)}>Shkarko</button>
            <button className="btn sm" onClick={() => print(pdfPrices)}>Printo</button>
            <button className="btn sm" onClick={() => share(pdfPrices)}>Ndaj</button>
          </div>
          <div className="hint" style={{ marginBottom: 6 }}>Nëse PDF-ja nuk shfaqet më poshtë (iPhone), shtyp “Hap në skedë të re” dhe pastaj Share, Save to Files.</div>
          <iframe title="pdf" src={pdfUrl} style={{ width: '100%', height: '70vh', border: '1px solid var(--line)', borderRadius: 8 }} />
        </Modal>
      )}
    </div>
  );
}
