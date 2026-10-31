import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { calcWindow, sumCalcs } from '../engine/calc';
import { Stat } from '../components/ui';
import { fmtDate, money } from '../lib/format';
import { quoteTotals } from '../lib/quotation';

export default function Dashboard() {
  const nav = useNavigate();
  const cat = useCatalog();
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const windows = useLiveQuery(() => db.windows.toArray(), []) ?? [];
  const quotes = useLiveQuery(() => db.quotations.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const lastBackup = useLiveQuery(() => db.settings.get('lastBackup'), [])?.value as number | undefined;
  const sym = cat.currency.symbol;

  const tot = useMemo(() => (cat.ready ? sumCalcs(windows.map((w) => calcWindow(w, cat.ctx))) : null), [windows, cat.ready, cat.ctx]);
  const issued = quotes.filter((q) => q.status !== 'Draft');
  const quoteValue = issued.reduce((s, q) => s + quoteTotals(q).grand, 0);
  const backupOld = !lastBackup || Date.now() - lastBackup > 14 * 86400000;

  return (
    <div>
      <h1>Paneli kryesor</h1>
      <div className="muted" style={{ marginBottom: 12 }}>{cat.business.name}</div>
      {backupOld && windows.length + quotes.length > 0 && (
        <div className="alert warn">
          {lastBackup ? `Kopja e fundit rezervë është më e vjetër se 14 ditë.` : 'Nuk ke bërë asnjë kopje rezervë.'}{' '}
          <Link to="/settings">Bëj kopje rezervë tani</Link> — të dhënat ruhen vetëm në këtë pajisje.
        </div>
      )}
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        <Stat label="Projekte gjithsej" value={projects.length} />
        <Stat label="Projekte aktive" value={projects.filter((p) => p.status === 'Aktiv').length} />
        <Stat label="Dritare / dyer (copë)" value={tot?.windows ?? 0} />
        <Stat label="Vlera e ofertave të lëshuara" value={money(quoteValue, sym)} />
        <Stat label="Kosto materialesh (të gjitha projektet)" value={money(tot?.cost.material ?? 0, sym)} />
        <Stat label="Kosto totale prodhimi" value={money(tot?.cost.total ?? 0, sym)} />
        <Stat label="Vlera e shitjes (llogaritur)" value={money(tot?.price ?? 0, sym)} />
        <Stat label="Fitimi i vlerësuar" value={money(tot?.profit ?? 0, sym)} tone={(tot?.profit ?? 0) >= 0 ? 'pos' : 'neg'} />
      </div>

      <div className="card">
        <h2>Veprime të shpejta</h2>
        <div className="row">
          <button className="btn gold" onClick={() => nav('/projects')}>+ Projekt i ri</button>
          <button className="btn" onClick={() => nav('/calculator')}>Llogaritje e shpejtë</button>
          <button className="btn" onClick={() => nav('/cutting')}>Optimizim prerjeje</button>
          <button className="btn" onClick={() => nav('/quotations')}>Ofertat</button>
          <button className="btn" onClick={() => nav('/materials')}>Materialet</button>
          <button className="btn" onClick={() => nav('/settings')}>Kopje rezervë</button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Projektet e fundit</h2>
          {projects.slice(0, 6).map((p) => (
            <div key={p.id} className="row sp" style={{ padding: '7px 0', borderBottom: '1px solid #edf0f4' }}>
              <Link to={`/projects/${p.id}`}><b>{p.name}</b> <span className="muted">· {p.clientName}</span></Link>
              <span className="tag gold">{p.status}</span>
            </div>
          ))}
          {projects.length === 0 && <div className="empty">Asnjë projekt ende.</div>}
        </div>
        <div className="card">
          <h2>Ofertat e fundit</h2>
          {quotes.slice(0, 6).map((q) => (
            <div key={q.id} className="row sp" style={{ padding: '7px 0', borderBottom: '1px solid #edf0f4' }}>
              <Link to={`/quotations/${q.id}`}><b>{q.number}</b> <span className="muted">· {q.client.name} · {fmtDate(q.date)}</span></Link>
              <span>{money(quoteTotals(q).grand, sym)}</span>
            </div>
          ))}
          {quotes.length === 0 && <div className="empty">Asnjë ofertë ende.</div>}
        </div>
      </div>
    </div>
  );
}
