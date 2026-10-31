import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { calcWindow, sumCalcs } from '../engine/calc';
import { Field, Modal, Stat, Tabs, confirmDo } from '../components/ui';
import { Client, PROJECT_STATUSES, Project, ProjectStatus, WindowItem } from '../types';
import { fmtDate, money, num, todayISO } from '../lib/format';
import { snapshotQuotation, nextNumber } from '../lib/quotation';
import { Drawing2D } from '../components/Drawing2D';

function ClientForm({ initial, onSave, onClose }: { initial: Client; onSave: (c: Client) => void; onClose: () => void }) {
  const [c, setC] = useState(initial);
  return (
    <Modal title={c.id ? 'Ndrysho klientin' : 'Klient i ri'} onClose={onClose}>
      <div className="grid g2">
        <Field label="Emri *"><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <Field label="Telefoni"><input value={c.phone} inputMode="tel" onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label="Email"><input value={c.email} type="email" onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
        <Field label="Adresa"><input value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
      </div>
      <Field label="Shënime"><textarea value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></Field>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!c.name.trim()} onClick={() => onSave(c)}>Ruaj</button>
        <button className="btn" onClick={onClose}>Anulo</button>
      </div>
    </Modal>
  );
}

export function ProjectsPage() {
  const nav = useNavigate();
  const cat = useCatalog();
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const windows = useLiveQuery(() => db.windows.toArray(), []) ?? [];
  const [tab, setTab] = useState<'projects' | 'clients'>('projects');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [clientEdit, setClientEdit] = useState<Client | null>(null);
  const [draft, setDraft] = useState<Project>(blankProject());

  const totals = useMemo(() => {
    const m = new Map<number, ReturnType<typeof sumCalcs>>();
    if (!cat.ready) return m;
    const by = new Map<number, WindowItem[]>();
    windows.forEach((w) => by.set(w.projectId, [...(by.get(w.projectId) ?? []), w]));
    by.forEach((ws, id) => m.set(id, sumCalcs(ws.map((w) => calcWindow(w, cat.ctx)))));
    return m;
  }, [windows, cat.ready, cat.ctx]);

  const list = projects.filter(
    (p) => (!status || p.status === status) && (!q || `${p.name} ${p.clientName}`.toLowerCase().includes(q.toLowerCase()))
  );
  const sym = cat.currency.symbol;

  return (
    <div>
      <div className="row sp">
        <h1>Projekte dhe klientë</h1>
        <div className="row">
          <button className="btn gold" onClick={() => { setDraft(blankProject()); setNewOpen(true); }}>+ Projekt i ri</button>
          <button className="btn" onClick={() => setClientEdit({ name: '', phone: '', email: '', address: '', notes: '' })}>+ Klient i ri</button>
        </div>
      </div>
      <Tabs tabs={[{ key: 'projects', label: `Projekte (${projects.length})` }, { key: 'clients', label: `Klientë (${clients.length})` }]} value={tab} onChange={setTab} />

      {tab === 'projects' && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <input style={{ flex: 1, minWidth: 180 }} placeholder="Kërko projekt ose klient…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Të gjitha statuset</option>
              {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="card tbl-wrap">
            <table>
              <thead>
                <tr><th>Projekti</th><th>Klienti</th><th>Data</th><th>Statusi</th><th className="r">Copë</th><th className="r">Çmimi</th><th className="r">Fitimi</th></tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const t = totals.get(p.id!);
                  return (
                    <tr key={p.id} className="click" onClick={() => nav(`/projects/${p.id}`)}>
                      <td><b>{p.name}</b></td>
                      <td>{p.clientName}</td>
                      <td>{fmtDate(p.date)}</td>
                      <td><span className="tag gold">{p.status}</span></td>
                      <td className="r">{t?.windows ?? 0}</td>
                      <td className="r">{money(t?.price ?? 0, sym)}</td>
                      <td className="r">{money(t?.profit ?? 0, sym)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 && <div className="empty">Asnjë projekt. Krijo një me “+ Projekt i ri”.</div>}
          </div>
        </>
      )}

      {tab === 'clients' && (
        <div className="card tbl-wrap">
          <table>
            <thead><tr><th>Emri</th><th>Telefoni</th><th>Email</th><th>Adresa</th><th>Projekte</th><th /></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td>
                  <td>{projects.filter((p) => p.clientId === c.id).length}</td>
                  <td className="r">
                    <button className="btn sm" onClick={() => setClientEdit(c)}>Ndrysho</button>{' '}
                    <button
                      className="btn sm danger"
                      onClick={async () => {
                        if (projects.some((p) => p.clientId === c.id)) return alert('Ky klient ka projekte. Projektet ruajnë të dhënat e tyre; klienti fshihet vetëm nga lista.');
                        if (confirmDo(`Fshi klientin “${c.name}”?`)) await db.clients.delete(c.id!);
                      }}
                    >
                      Fshi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && <div className="empty">Asnjë klient.</div>}
        </div>
      )}

      {clientEdit && (
        <ClientForm
          initial={clientEdit}
          onClose={() => setClientEdit(null)}
          onSave={async (c) => {
            if (c.id) await db.clients.put(c);
            else await db.clients.add(c);
            setClientEdit(null);
          }}
        />
      )}

      {newOpen && (
        <Modal title="Projekt i ri" onClose={() => setNewOpen(false)}>
          <ProjectFields p={draft} onChange={setDraft} clients={clients} />
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              disabled={!draft.name.trim()}
              onClick={async () => {
                const id = await db.projects.add({ ...draft, createdAt: Date.now() });
                setNewOpen(false);
                nav(`/projects/${id}`);
              }}
            >
              Krijo projektin
            </button>
            <button className="btn" onClick={() => setNewOpen(false)}>Anulo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function blankProject(): Project {
  return { name: '', clientName: '', phone: '', email: '', address: '', date: todayISO(), notes: '', status: 'Ofertë', createdAt: Date.now() };
}

function ProjectFields({ p, onChange, clients }: { p: Project; onChange: (p: Project) => void; clients: Client[] }) {
  return (
    <>
      <div className="grid g2">
        <Field label="Emri i projektit *"><input value={p.name} onChange={(e) => onChange({ ...p, name: e.target.value })} /></Field>
        <Field label="Zgjidh klient ekzistues">
          <select
            value={p.clientId ?? ''}
            onChange={(e) => {
              const c = clients.find((x) => x.id === Number(e.target.value));
              if (c) onChange({ ...p, clientId: c.id, clientName: c.name, phone: c.phone, email: c.email, address: c.address });
              else onChange({ ...p, clientId: undefined });
            }}
          >
            <option value="">— klient i ri / pa klient —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Emri i klientit"><input value={p.clientName} onChange={(e) => onChange({ ...p, clientName: e.target.value })} /></Field>
        <Field label="Telefoni"><input value={p.phone} inputMode="tel" onChange={(e) => onChange({ ...p, phone: e.target.value })} /></Field>
        <Field label="Email"><input value={p.email} type="email" onChange={(e) => onChange({ ...p, email: e.target.value })} /></Field>
        <Field label="Adresa"><input value={p.address} onChange={(e) => onChange({ ...p, address: e.target.value })} /></Field>
        <Field label="Data"><input type="date" value={p.date} onChange={(e) => onChange({ ...p, date: e.target.value })} /></Field>
        <Field label="Statusi">
          <select value={p.status} onChange={(e) => onChange({ ...p, status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Shënime"><textarea value={p.notes} onChange={(e) => onChange({ ...p, notes: e.target.value })} /></Field>
    </>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const cat = useCatalog();
  const project = useLiveQuery(() => db.projects.get(pid), [pid]);
  const windows = useLiveQuery(() => db.windows.where('projectId').equals(pid).sortBy('order'), [pid]) ?? [];
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const quotes = useLiveQuery(() => db.quotations.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const [draft, setDraft] = useState<Project | null>(null);
  const [move, setMove] = useState<WindowItem | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const calcs = useMemo(() => (cat.ready ? windows.map((w) => ({ w, c: calcWindow(w, cat.ctx) })) : []), [windows, cat.ready, cat.ctx]);
  const tot = useMemo(() => sumCalcs(calcs.map((x) => x.c)), [calcs]);
  const sym = cat.currency.symbol;

  if (!project) return <div className="empty">Duke ngarkuar…</div>;
  const p = draft ?? project;
  const save = async (np: Project) => {
    setDraft(np);
    await db.projects.put(np);
  };

  const dup = async (w: WindowItem) => {
    const { id: _i, ...rest } = w;
    void _i;
    await db.windows.add({ ...JSON.parse(JSON.stringify(rest)), name: `${w.name} (kopje)`, order: windows.length });
  };

  const createQuote = async () => {
    if (!windows.length) return alert('Shto të paktën një dritare në projekt.');
    const existing = (await db.quotations.toArray()).map((q) => q.number);
    const q = snapshotQuotation(project, windows, cat.ctx, cat.colors, cat.business, cat.quote, nextNumber(existing));
    const qid = await db.quotations.add(q);
    nav(`/quotations/${qid}`);
  };

  return (
    <div>
      <div className="row sp">
        <div className="row"><Link to="/projects" className="btn sm">← Projektet</Link><h1 style={{ margin: 0 }}>{project.name}</h1></div>
        <div className="row">
          <button className="btn gold" onClick={() => nav(`/projects/${pid}/window/new`)}>+ Dritare / derë</button>
          <button className="btn primary" onClick={createQuote}>Krijo ofertë</button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirmDo(`Fshi projektin “${project.name}” dhe ${windows.length} dritare? Ofertat e lëshuara ruhen.`)) return;
              await db.windows.where('projectId').equals(pid).delete();
              await db.projects.delete(pid);
              nav('/projects');
            }}
          >
            Fshi
          </button>
        </div>
      </div>

      <div className="grid g4 keep2" style={{ margin: '12px 0' }}>
        <Stat label="Dritare / dyer (copë)" value={tot.windows} />
        <Stat label="Kosto totale" value={money(tot.cost.total, sym)} />
        <Stat label="Çmimi i shitjes" value={money(tot.price, sym)} />
        <Stat label="Fitimi i vlerësuar" value={`${money(tot.profit, sym)} (${num(tot.marginPct, 1)}%)`} tone={tot.profit >= 0 ? 'pos' : 'neg'} />
      </div>

      <div className="card">
        <h2>Të dhënat e projektit</h2>
        <ProjectFields p={p} onChange={save} clients={clients} />
      </div>

      <div className="card">
        <div className="row sp"><h2 style={{ margin: 0 }}>Dritaret dhe dyert</h2><span className="muted small">{num(tot.area, 2)} m² gjithsej</span></div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Poz.</th><th>Lloji</th><th>Përmasat</th><th>Sistemi</th><th className="r">Copë</th><th className="r">Kosto</th><th className="r">Çmimi</th><th /></tr>
            </thead>
            <tbody>
              {calcs.map(({ w, c }) => (
                <tr key={w.id}>
                  <td><Link to={`/projects/${pid}/window/${w.id}`}><b>{w.name}</b></Link>{c.errors.length > 0 && <span className="tag bad" style={{ marginLeft: 6 }}>gabim</span>}</td>
                  <td>{w.kind}</td>
                  <td>{w.width} × {w.height}</td>
                  <td>{cat.ctx.systems.get(w.systemId)?.name ?? '?'}</td>
                  <td className="r">{w.qty}</td>
                  <td className="r">{money(c.costs.total, sym)}</td>
                  <td className="r">{money(c.price, sym)}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => nav(`/projects/${pid}/window/${w.id}`)}>Ndrysho</button>{' '}
                    <button className="btn sm" onClick={() => setPreview(w.id!)}>2D</button>{' '}
                    <button className="btn sm" onClick={() => dup(w)}>Dyfisho</button>{' '}
                    <button className="btn sm" onClick={() => setMove(w)}>Zhvendos</button>{' '}
                    <button className="btn sm danger" onClick={async () => confirmDo(`Fshi “${w.name}”?`) && db.windows.delete(w.id!)}>Fshi</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {windows.length === 0 && <div className="empty">Ende pa dritare. Shtyp “+ Dritare / derë”.</div>}
        </div>
      </div>

      <div className="card">
        <h2>Ofertat e këtij projekti</h2>
        {quotes.length === 0 && <div className="muted">Asnjë ofertë ende.</div>}
        {quotes.map((q) => (
          <div key={q.id} className="row sp" style={{ padding: '6px 0', borderBottom: '1px solid #edf0f4' }}>
            <Link to={`/quotations/${q.id}`}><b>{q.number}</b></Link>
            <span>{fmtDate(q.date)}</span><span className="tag gold">{q.status}</span>
          </div>
        ))}
      </div>

      {move && (
        <Modal title={`Zhvendos “${move.name}”`} onClose={() => setMove(null)}>
          <Field label="Projekti i ri">
            <select
              defaultValue=""
              onChange={async (e) => {
                const to = Number(e.target.value);
                if (!to) return;
                const n = await db.windows.where('projectId').equals(to).count();
                await db.windows.update(move.id!, { projectId: to, order: n });
                setMove(null);
              }}
            >
              <option value="">— zgjidh —</option>
              {projects.filter((x) => x.id !== pid).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.clientName})</option>)}
            </select>
          </Field>
        </Modal>
      )}
      {preview !== null && (() => {
        const w = windows.find((x) => x.id === preview);
        const sys = w && cat.ctx.systems.get(w.systemId);
        return w && sys ? (
          <Modal title={`${w.name} — ${w.width}×${w.height}`} onClose={() => setPreview(null)}>
            <Drawing2D W={w.width} H={w.height} layout={w.layout} params={sys.params} colorHex={cat.colors.find((c) => c.name === w.color)?.hex} />
          </Modal>
        ) : null;
      })()}
    </div>
  );
}
