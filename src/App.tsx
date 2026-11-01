import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ensureSeed } from './db';
import { useCatalog } from './lib/data';
import Dashboard from './pages/Dashboard';
import { ProjectDetail, ProjectsPage } from './pages/Projects';
import WindowEditor from './pages/WindowEditor';
import Materials from './pages/Materials';
import { AccessoriesPage, CalculatorPage, CuttingPage, GlassPage } from './pages/Tools';
import { QuotationEditor, QuotationsPage } from './pages/Quotations';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const NAV = [
  ['/', '▦', 'Paneli'],
  ['/projects', '▤', 'Projekte dhe klientë'],
  ['/designer', '◫', 'Dizajneri i dritareve'],
  ['/materials', '▥', 'Databaza e materialeve'],
  ['/calculator', '∑', 'Kalkulatori teknik'],
  ['/cutting', '✂', 'Optimizimi i prerjes'],
  ['/glass', '◇', 'Kalkulatori i qelqit'],
  ['/accessories', '⚙', 'Kalkulatori i aksesorëve'],
  ['/quotations', '▭', 'Ofertat'],
  ['/reports', '◔', 'Raporte dhe fitimi'],
  ['/settings', '☰', 'Cilësimet dhe backup']
] as const;

function Shell() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const cat = useCatalog();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    document.body.classList.toggle('big', !!cat.appearance.bigButtons);
    document.body.classList.toggle('light-nav', cat.appearance.theme === 'light');
  }, [cat.appearance]);
  return (
    <div className="app">
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="3" y="3" width="42" height="42" rx="2" fill="none" stroke="#c9a227" strokeWidth="3" />
            <rect x="9" y="9" width="14" height="30" fill="#1d3557" stroke="#e8e8e8" strokeWidth="1.5" />
            <rect x="25" y="9" width="14" height="30" fill="#1d3557" stroke="#e8e8e8" strokeWidth="1.5" />
            <path d="M9 24 L23 9 M9 24 L23 39 M39 24 L25 9 M39 24 L25 39" stroke="#c9a227" strokeWidth="1.2" fill="none" />
          </svg>
          <div><b>GZ ALUMINIUM</b><span>GLASS &amp; PVC</span></div>
        </div>
        <nav className="nav">
          {NAV.map(([to, ic, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span className="ic">{ic}</span>{label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} onClick={() => setOpen(false)} />}
      <div className="main">
        <div className="topbar">
          <button className="btn sm" onClick={() => setOpen(!open)} aria-label="Menu">☰ Menu</button>
          <b>GZ Aluminium Glass &amp; PVC</b>
        </div>
        <div className="content">
          {!cat.ready ? (
            <div className="empty">Duke ngarkuar të dhënat…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/projects/:pid/window/:wid" element={<WindowEditor />} />
              <Route path="/designer" element={<DesignerEntry />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/calculator" element={<CalculatorPage />} />
              <Route path="/cutting" element={<CuttingPage />} />
              <Route path="/glass" element={<GlassPage />} />
              <Route path="/accessories" element={<AccessoriesPage />} />
              <Route path="/quotations" element={<QuotationsPage />} />
              <Route path="/quotations/:id" element={<QuotationEditor />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          )}
        </div>
      </div>
    </div>
  );
}

/** Designer menu entry: choose a project, then open a new window in it. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { Link, useNavigate } from 'react-router-dom';

function DesignerEntry() {
  const nav = useNavigate();
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []) ?? [];
  return (
    <div>
      <h1>Dizajneri i dritareve dhe dyerve</h1>
      <p className="muted">Çdo dritare hapet brenda një projekti. Zgjidh projektin për të shtuar dritare të re ose hap një ekzistuese.</p>
      <div className="card">
        {projects.length === 0 && (
          <div className="empty">Nuk ke projekte. <Link to="/projects">Krijo projektin e parë</Link>.</div>
        )}
        {projects.map((p) => (
          <div key={p.id} className="row sp" style={{ padding: '8px 0', borderBottom: '1px solid #edf0f4' }}>
            <div><b>{p.name}</b> <span className="muted">· {p.clientName}</span></div>
            <div className="row">
              <Link className="btn sm" to={`/projects/${p.id}`}>Hap projektin</Link>
              <button className="btn sm gold" onClick={() => nav(`/projects/${p.id}/window/new`)}>+ Dritare e re</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    ensureSeed()
      .then(() => setReady(true))
      .catch((e) => setErr(String(e)));
    // ask the browser not to evict IndexedDB (important on iOS/Safari)
    navigator.storage?.persist?.().catch(() => undefined);
  }, []);
  if (err) return <div className="content"><div className="alert err">Gabim në hapjen e databazës: {err}. Provo ta hapësh në Safari/Chrome normal (jo në modalitet privat).</div></div>;
  if (!ready) return <div className="content"><div className="empty">Duke përgatitur databazën…</div></div>;
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
