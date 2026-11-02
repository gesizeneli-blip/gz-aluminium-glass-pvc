import { SUPABASE_KEY, SUPABASE_URL } from './config';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  email: string;
  uid: string;
}

const KEY = 'gz.sync.session';

export function loadSession(): Session | null {
  try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as Session) : null; } catch { return null; }
}
function saveSession(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}

async function authCall(path: string, body: unknown): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(translateErr(j.msg || j.error_description || j.message || j.error || `Gabim ${r.status}`));
  return j;
}

function translateErr(m: string): string {
  const x = String(m).toLowerCase();
  if (x.includes('invalid login')) return 'Email ose fjalëkalim i gabuar.';
  if (x.includes('email not confirmed')) return 'Email-i nuk është konfirmuar. Hap lidhjen që të erdhi në email.';
  if (x.includes('already registered') || x.includes('already been registered')) return 'Ky email ka tashmë llogari. Hyr me fjalëkalimin.';
  if (x.includes('password') && x.includes('characters')) return 'Fjalëkalimi duhet të ketë të paktën 6 shkronja.';
  if (x.includes('rate limit')) return 'Shumë përpjekje. Provo pas pak minutash.';
  if (x.includes('signups not allowed')) return 'Regjistrimi i llogarive të reja është i mbyllur.';
  return m;
}

function toSession(j: any): Session {
  return {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
    email: j.user?.email ?? '', uid: j.user?.id ?? ''
  };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const s = toSession(await authCall('token?grant_type=password', { email, password }));
  saveSession(s);
  return s;
}

/** returns null when the project requires email confirmation first */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const j = await authCall('signup', { email, password });
  if (!j.access_token) return null;
  const s = toSession(j);
  saveSession(s);
  return s;
}

export function signOut() { saveSession(null); }

export async function token(): Promise<string> {
  let s = loadSession();
  if (!s) throw new Error('Nuk je i kyçur.');
  if (s.expires_at - 60 < Date.now() / 1000) {
    try {
      s = toSession(await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
      saveSession(s);
    } catch (e) {
      saveSession(null);
      throw new Error('Sesioni skadoi. Hyr përsëri.');
    }
  }
  return s.access_token;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const t = await token();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || `Gabim rrjeti ${r.status}`);
  }
  return r;
}

export interface RemoteRow { tbl: string; doc_id: string; data: any; deleted: boolean; updated_at: string }

export async function fetchChanges(cursor: string | null, limit = 500): Promise<RemoteRow[]> {
  const q = `sync_docs?select=tbl,doc_id,data,deleted,updated_at&order=updated_at.asc&limit=${limit}` +
    (cursor ? `&updated_at=gt.${encodeURIComponent(cursor)}` : '');
  return (await rest(q)).json();
}

export async function fetchAllKeys(): Promise<{ tbl: string; doc_id: string; deleted: boolean }[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await rest('sync_docs?select=tbl,doc_id,deleted&order=updated_at.asc', { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    const part = await r.json();
    out.push(...part);
    if (part.length < 1000) break;
  }
  return out;
}

export async function upsertRows(rows: { tbl: string; doc_id: string; data: any; deleted: boolean }[]) {
  if (!rows.length) return;
  await rest('sync_docs?on_conflict=user_id,tbl,doc_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows)
  });
}
