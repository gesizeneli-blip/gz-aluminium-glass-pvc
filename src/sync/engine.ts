import { db, TABLES } from '../db';
import * as api from './client';
import { SEED_VERSION } from '../db/seed';

/** every local table except the change queue is synced */
const SYNC_TABLES = TABLES as readonly string[];
const NUMERIC = new Set(['clients', 'projects', 'windows', 'quotations', 'templates']);
/** settings that are device-local */
const LOCAL_SETTINGS = new Set(['seeded', 'seedVersion', 'lastBackup']);

const LS_CURSOR = 'gz.sync.cursor';
const LS_LINKED = 'gz.sync.linked';
const LS_LAST = 'gz.sync.last';

export type SyncState = { status: 'off' | 'idle' | 'syncing' | 'error'; message: string; last: number | null; email: string };
let state: SyncState = { status: 'off', message: '', last: null, email: '' };
const listeners = new Set<(s: SyncState) => void>();
const emit = (p: Partial<SyncState>) => { state = { ...state, ...p }; listeners.forEach((l) => l(state)); };
export const getSyncState = () => state;
export function onSyncState(fn: (s: SyncState) => void) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; }

const isLinked = () => { try { return localStorage.getItem(LS_LINKED) === '1' && !!api.loadSession(); } catch { return false; } };
const getCursor = () => { try { return localStorage.getItem(LS_CURSOR); } catch { return null; } };
const setCursor = (c: string | null) => { try { c ? localStorage.setItem(LS_CURSOR, c) : localStorage.removeItem(LS_CURSOR); } catch { /* */ } };

let applyingRemote = false;
let pending: { tbl: string; key: string | number; del?: boolean }[] = [];
let flushTimer: any = null;
let pushTimer: any = null;

function queue(tbl: string, key: any, del?: boolean) {
  if (applyingRemote || !isLinked()) return;
  if (tbl === 'settings' && LOCAL_SETTINGS.has(String(key))) return;
  pending.push({ tbl, key, del });
  if (!flushTimer) flushTimer = setTimeout(flushPending, 0);
}
async function flushPending() {
  flushTimer = null;
  const items = pending; pending = [];
  if (!items.length) return;
  try { await db.outbox.bulkAdd(items as any); } catch { /* ignore */ }
  schedulePush();
}
function schedulePush(ms = 2500) {
  if (!isLinked()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { syncNow().catch(() => {}); }, ms);
}

let newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
let lastId = 0;
function genId() { let v = newId(); if (v <= lastId) v = lastId + 1; lastId = v; return v; }

let installed = false;
export function installSyncHooks() {
  if (installed) return;
  installed = true;
  for (const t of SYNC_TABLES) {
    const table: any = (db as any)[t];
    table.hook('creating', function (this: any, pk: any) {
      this.onsuccess = (k: any) => queue(t, k);
      // globally unique numeric ids so two devices never create the same id
      if (NUMERIC.has(t) && pk == null) return genId();
      return undefined;
    });
    table.hook('updating', function (this: any, _mods: any, pk: any) {
      this.onsuccess = () => queue(t, pk);
    });
    table.hook('deleting', function (this: any, pk: any) {
      this.onsuccess = () => queue(t, pk, true);
    });
  }
}

const keyOf = (tbl: string, doc_id: string) => (NUMERIC.has(tbl) ? Number(doc_id) : doc_id);

async function applyRemote(rows: api.RemoteRow[]) {
  const pend = new Set((await db.outbox.toArray()).map((o) => `${o.tbl}|${o.key}`));
  applyingRemote = true;
  try {
    for (const r of rows) {
      if (!SYNC_TABLES.includes(r.tbl)) continue;
      if (pend.has(`${r.tbl}|${r.doc_id}`)) continue; // local unsent change wins
      const table: any = (db as any)[r.tbl];
      if (r.deleted) await table.delete(keyOf(r.tbl, r.doc_id));
      else if (r.data) await table.put(r.data);
    }
  } finally { applyingRemote = false; }
}

async function pull() {
  for (;;) {
    const rows = await api.fetchChanges(getCursor(), 500);
    if (!rows.length) return;
    await applyRemote(rows);
    setCursor(rows[rows.length - 1].updated_at);
    if (rows.length < 500) return;
  }
}

async function push() {
  const items = await db.outbox.toArray();
  if (!items.length) return;
  const maxSeq = Math.max(...items.map((i) => i.seq!));
  const uniq = new Map<string, { tbl: string; key: string | number }>();
  items.forEach((i) => uniq.set(`${i.tbl}|${i.key}`, { tbl: i.tbl, key: i.key }));
  const rows: { tbl: string; doc_id: string; data: any; deleted: boolean }[] = [];
  for (const { tbl, key } of uniq.values()) {
    const rec = await (db as any)[tbl].get(key);
    rows.push({ tbl, doc_id: String(key), data: rec ?? null, deleted: !rec });
  }
  for (let i = 0; i < rows.length; i += 200) await api.upsertRows(rows.slice(i, i + 200));
  await db.outbox.where('seq').belowOrEqual(maxSeq).delete();
}

let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (!isLinked()) return Promise.resolve();
  if (running) return running;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { emit({ status: 'idle', message: 'Pa internet – do sinkronizohet kur të lidhesh.' }); return Promise.resolve(); }
  emit({ status: 'syncing', message: 'Duke sinkronizuar…' });
  running = (async () => {
    try {
      await flushPending();
      await push();
      await pull();
      const last = Date.now();
      try { localStorage.setItem(LS_LAST, String(last)); } catch { /* */ }
      emit({ status: 'idle', message: 'Sinkronizuar.', last });
    } catch (e) {
      emit({ status: 'error', message: (e as Error).message });
    } finally { running = null; }
  })();
  return running;
}

/** Number of user records (projects) stored locally - to warn before replacing a device. */
export async function localHasUserData() {
  return (await db.projects.count()) + (await db.clients.count()) + (await db.quotations.count()) > 0;
}

async function enqueueAllLocal() {
  const all: any[] = [];
  for (const t of SYNC_TABLES) {
    const keys = await (db as any)[t].toCollection().primaryKeys();
    for (const k of keys) if (!(t === 'settings' && LOCAL_SETTINGS.has(String(k)))) all.push({ tbl: t, key: k });
  }
  await db.outbox.clear();
  await db.outbox.bulkAdd(all);
}

/** Link this device: what to do with data is decided by `mode`. */
export async function connect(email: string, password: string, mode: 'auto' | 'cloud' | 'local' = 'auto'): Promise<'linked' | 'need-choice'> {
  const session = await api.signIn(email, password);
  emit({ email: session.email });
  const remote = await api.fetchChanges(null, 1);
  const cloudHas = remote.length > 0;
  const localHas = await localHasUserData();
  if (cloudHas && localHas && mode === 'auto') return 'need-choice';
  try { localStorage.setItem(LS_LINKED, '1'); } catch { /* */ }
  setCursor(null);
  if (cloudHas && mode !== 'local') {
    // take the cloud copy: wipe synced tables, then pull everything
    applyingRemote = true;
    try { for (const t of SYNC_TABLES) await (db as any)[t].clear(); await db.outbox.clear(); } finally { applyingRemote = false; }
    await pull();
    await keepLocalSettings();
  } else {
    await enqueueAllLocal();
  }
  await syncNow();
  return 'linked';
}

/** after wiping tables, restore device-local settings flags so the seed does not run again */
async function keepLocalSettings() {
  const have = await db.settings.get('seeded');
  if (!have) {
    applyingRemote = true;
    try {
      await db.settings.bulkPut([{ key: 'seeded', value: Date.now() }, { key: 'seedVersion', value: SEED_VERSION }]);
    } finally { applyingRemote = false; }
  }
}

export async function disconnect() {
  api.signOut();
  try { localStorage.removeItem(LS_LINKED); localStorage.removeItem(LS_CURSOR); } catch { /* */ }
  await db.outbox.clear();
  emit({ status: 'off', message: '', email: '' });
}

/** After a restore-from-file or full reset: make the cloud identical to this device. */
export async function replaceCloudWithLocal() {
  if (!isLinked()) return;
  await enqueueAllLocal();
  const keys = await api.fetchAllKeys();
  const mine = new Set((await db.outbox.toArray()).map((o) => `${o.tbl}|${o.key}`));
  const stale = keys.filter((k) => !k.deleted && !mine.has(`${k.tbl}|${k.doc_id}`));
  for (let i = 0; i < stale.length; i += 200)
    await api.upsertRows(stale.slice(i, i + 200).map((k) => ({ tbl: k.tbl, doc_id: k.doc_id, data: null, deleted: true })));
  await syncNow();
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  installSyncHooks();
  const s = api.loadSession();
  let last: number | null = null;
  try { last = Number(localStorage.getItem(LS_LAST)) || null; } catch { /* */ }
  if (s && isLinked()) {
    emit({ status: 'idle', email: s.email, last, message: '' });
    syncNow();
  }
  window.addEventListener('online', () => { syncNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
}
export const syncLinked = isLinked;
