import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useCatalog } from '../lib/data';
import { calcWindow, sumCalcs } from '../engine/calc';
import { Modal, Stat, useReveal } from '../components/ui';
import { fmtDate, money } from '../lib/format';
import { quoteTotals } from '../lib/quotation';
import type { Project } from '../types';

const SERVICES = [
  { to: '/projects', title: 'Projekt i ri', text: 'Krijo projekt për klientin, shto dritare dhe dyer, dhe ndiq statusin deri në montim.', cta: 'Hap projektet' },
  { to: '/calculator', title: 'Llogaritje e shpejtë', text: 'Profile, qelq dhe aksesorë për një dritare, pa pasur nevojë të krijosh projekt.', cta: 'Hap kalkulatorin' },
  { to: '/cutting', title: 'Optimizim prerjeje', text: 'Ndarja e copave në shufra me sa më pak humbje, me kerf dhe shtesa të llogaritura.', cta: 'Hap optimizimin' },
  { to: '/quotations', title: 'Ofertat', text: 'Oferta profesionale në PDF, me ose pa çmime, të ngrira në momentin e lëshimit.', cta: 'Hap ofertat' },
  { to: '/materials', title: 'Materialet', text: 'Sisteme, profile, qelqe dhe aksesorë me çmime blerjeje dhe shitjeje.', cta: 'Hap materialet' },
  { to: '/settings', title: 'Kopje rezervë', text: 'Ruaj të gjitha të dhënat në një skedar ose sinkronizo me cloud.', cta: 'Hap cilësimet' }
] as const;

const MARQUEE = ['Alumin', 'PVC', 'Qelq', 'Dritare', 'Dyer', 'Fasada', 'Prerje', 'Oferta'];

export default function Dashboard() {
  const nav = useNavigate();
  const cat = useCatalog();
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const windows = useLiveQuery(() => db.windows.toArray(), []) ?? [];
  const quotes = useLiveQuery(() => db.quotations.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const lastBackup = useLiveQuery(() => db.settings.get('lastBackup'), [])?.value as number | undefined;
  const sym = cat.currency.symbol;
  const [winOpen, setWinOpen] = useState(false);
  const [service, setService] = useState<(typeof SERVICES)[number] | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const reveal = useReveal<HTMLDivElement>();

  const tot = useMemo(() => (cat.ready ? sumCalcs(windows.map((w) => calcWindow(w, cat.ctx))) : null), [windows, cat.ready, cat.ctx]);
  const issued = quotes.filter((q) => q.status !== 'Draft');
  const quoteValue = issued.reduce((s, q) => s + quoteTotals(q).grand, 0);
  const backupOld = !lastBackup || Date.now() - lastBackup > 14 * 86400000;
  const projectWindows = project ? windows.filter((w) => w.projectId === project.id) : [];
  const projectQuotes = project ? quotes.filter((q) => q.projectId === project.id) : [];

  return (
    <div ref={reveal}>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">PUNËTORI · OFERTA · LLOGARITJE</div>
          <h1 className="title">
            <span className="line"><span>{cat.business.name}</span></span>
          </h1>
          <div className="sub">Alumin, qelq dhe PVC. Përmasa të sakta, prerje pa humbje, oferta profesionale.</div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn gold" onClick={() => nav('/projects')}>+ Projekt i ri</button>
            <button className="btn primary" onClick={() => nav('/quotations')}>Ofertat →</button>
          </div>
        </div>
        <button
          className={'win-art' + (winOpen ? ' open' : '')}
          onClick={() => setWinOpen(!winOpen)}
          aria-label={winOpen ? 'Mbyll dritaren' : 'Hap dritaren'}
          title="Kliko për ta hapur"
        >
          <span className="frame">
            <span className="sky" />
            <span className="leaf l"><i /></span>
            <span className="leaf r"><i /></span>
          </span>
        </button>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="track">
          {[...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}<b>✦</b></span>)}
        </div>
      </div>

      {backupOld && windows.length + quotes.length > 0 && (
        <div className="alert warn">
          {lastBackup ? `Kopja e fundit rezervë është më e vjetër se 14 ditë.` : 'Nuk ke bërë asnjë kopje rezervë.'}{' '}
          <Link to="/settings">Bëj kopje rezervë tani</Link> — të dhënat ruhen vetëm në këtë pajisje.
        </div>
      )}

      <SectionHead n="01" title="Pasqyra" />
      <div className="grid g4 keep2" style={{ marginBottom: 14 }}>
        {[
          ['Projekte gjithsej', projects.length],
          ['Projekte aktive', projects.filter((p) => p.status === 'Aktiv').length],
          ['Dritare / dyer (copë)', tot?.windows ?? 0],
          ['Vlera e ofertave të lëshuara', money(quoteValue, sym)],
          ['Kosto materialesh (të gjitha projektet)', money(tot?.cost.material ?? 0, sym)],
          ['Kosto totale prodhimi', money(tot?.cost.total ?? 0, sym)],
          ['Vlera e shitjes (llogaritur)', money(tot?.price ?? 0, sym)]
        ].map(([l, v]) => (
          <div key={l as string} data-reveal><Stat label={l as string} value={v} /></div>
        ))}
        <div data-reveal>
          <Stat label="Fitimi i vlerësuar" value={money(tot?.profit ?? 0, sym)} tone={(tot?.profit ?? 0) >= 0 ? 'pos' : 'neg'} />
        </div>
      </div>

      <SectionHead n="02" title="Çfarë do të bësh sot?" />
      <div className="tiles">
        {SERVICES.map((s, i) => (
          <button key={s.to} className="tile" data-reveal onClick={() => setService(s)}>
            <span className="num">{String(i + 1).padStart(2, '0')}</span>
            <span className="t">{s.title}</span>
            <span className="arrow">→</span>
          </button>
        ))}
      </div>

      <div className="grid g2">
        <div>
          <SectionHead n="03" title="Projektet e fundit" />
          <div className="list">
            {projects.slice(0, 6).map((p) => (
              <button key={p.id} className="list-row" data-reveal onClick={() => setProject(p)}>
                <span><b>{p.name}</b> <span className="muted">· {p.clientName}</span></span>
                <span className="tag gold">{p.status}</span>
              </button>
            ))}
            {projects.length === 0 && <div className="empty">Asnjë projekt ende.</div>}
          </div>
        </div>
        <div>
          <SectionHead n="04" title="Ofertat e fundit" />
          <div className="list">
            {quotes.slice(0, 6).map((q) => (
              <Link key={q.id} className="list-row" data-reveal to={`/quotations/${q.id}`}>
                <span><b>{q.number}</b> <span className="muted">· {q.client.name} · {fmtDate(q.date)}</span></span>
                <span>{money(quoteTotals(q).grand, sym)}</span>
              </Link>
            ))}
            {quotes.length === 0 && <div className="empty">Asnjë ofertë ende.</div>}
          </div>
        </div>
      </div>

      {service && (
        <Modal title={service.title} onClose={() => setService(null)}>
          <p className="lead">{service.text}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn gold" onClick={() => nav(service.to)}>{service.cta} →</button>
          </div>
        </Modal>
      )}

      {project && (
        <Modal title={project.name} onClose={() => setProject(null)}>
          <div className="grid g3 keep2" style={{ marginBottom: 12 }}>
            <Stat label="Klienti" value={project.clientName || '—'} />
            <Stat label="Dritare / dyer" value={projectWindows.length} />
            <Stat label="Oferta" value={projectQuotes.length} />
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="tag gold">{project.status}</span>
            {project.date && <span className="muted small">{fmtDate(project.date)}</span>}
            {project.phone && <span className="muted small">☎ {project.phone}</span>}
            {project.address && <span className="muted small">⌂ {project.address}</span>}
          </div>
          {project.notes && <p className="muted">{project.notes}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => nav(`/projects/${project.id}/window/new`)}>+ Dritare e re</button>
            <button className="btn gold" onClick={() => nav(`/projects/${project.id}`)}>Hap projektin →</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="sec-head" data-reveal>
      <span className="n">{n}</span>
      <h2>{title}</h2>
      <span className="rule" />
    </div>
  );
}
