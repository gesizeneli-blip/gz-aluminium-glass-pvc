import Dexie, { Table } from 'dexie';
import type {
  Accessory, Client, ColorDef, GlassType, LaborRate, Profile, ProfileCategory, Project, System, Template, WindowItem
} from '../types';
import { ACCESSORIES, buildSystemsAndProfiles, COLORS, DEFAULT_SETTINGS, GLASS_TYPES, LABOR_RATES, SEED_CATEGORIES, SEED_VERSION } from './seed';
import type { QuotationRec } from '../lib/quotation';

export interface OutboxRow { seq?: number; tbl: string; key: string | number; del?: boolean }

export interface SettingRow {
  key: string;
  value: any;
}

class GZDB extends Dexie {
  clients!: Table<Client, number>;
  projects!: Table<Project, number>;
  windows!: Table<WindowItem, number>;
  systems!: Table<System, string>;
  profiles!: Table<Profile, string>;
  glassTypes!: Table<GlassType, string>;
  accessories!: Table<Accessory, string>;
  quotations!: Table<QuotationRec, number>;
  templates!: Table<Template, number>;
  settings!: Table<SettingRow, string>;
  outbox!: Table<OutboxRow, number>;

  constructor() {
    super('gz-aluminium-db');
    this.version(1).stores({
      clients: '++id,name',
      projects: '++id,clientId,status,date,createdAt',
      windows: '++id,projectId,systemId',
      systems: 'id',
      profiles: 'id,systemId',
      glassTypes: 'id',
      accessories: 'id',
      quotations: '++id,projectId,number,status,createdAt',
      templates: '++id',
      settings: 'key'
    });
    // v2: local change queue used by cloud sync
    this.version(2).stores({
      clients: '++id,name',
      projects: '++id,clientId,status,date,createdAt',
      windows: '++id,projectId,systemId',
      systems: 'id',
      profiles: 'id,systemId',
      glassTypes: 'id',
      accessories: 'id',
      quotations: '++id,projectId,number,status,createdAt',
      templates: '++id',
      settings: 'key',
      outbox: '++seq'
    });
  }
}

export const db = new GZDB();

export const TABLES = ['clients', 'projects', 'windows', 'systems', 'profiles', 'glassTypes', 'accessories', 'quotations', 'templates', 'settings'] as const;

export async function ensureSeed() {
  const done = await db.settings.get('seeded');
  if (done) return migrateSeed();
  const { systems, profiles } = buildSystemsAndProfiles();
  await db.transaction('rw', [db.systems, db.profiles, db.glassTypes, db.accessories, db.settings], async () => {
    await db.systems.bulkPut(systems);
    await db.profiles.bulkPut(profiles);
    await db.glassTypes.bulkPut(GLASS_TYPES);
    await db.accessories.bulkPut(ACCESSORIES);
    await db.settings.bulkPut([
      { key: 'business', value: DEFAULT_SETTINGS.business },
      { key: 'quote', value: DEFAULT_SETTINGS.quote },
      { key: 'pdf', value: DEFAULT_SETTINGS.pdf },
      { key: 'appearance', value: DEFAULT_SETTINGS.appearance },
      { key: 'currency', value: DEFAULT_SETTINGS.currency },
      { key: 'laborRates', value: LABOR_RATES },
      { key: 'colors', value: COLORS },
      { key: 'categories', value: SEED_CATEGORIES },
      { key: 'seeded', value: Date.now() },
      { key: 'seedVersion', value: SEED_VERSION }
    ]);
  });
}

const OLD_DEFAULT_SYSTEMS = ['trocal70', 'trocal76md', 'kommerling76md', 'alumils67', 'alumils560', 'weiss72'];

/** Adds the new catalogue (never overwrites rows the owner may have edited) and removes untouched old defaults. */
async function migrateSeed() {
  const v = (await db.settings.get('seedVersion'))?.value ?? 1;
  if (v >= SEED_VERSION) return;
  const { systems, profiles } = buildSystemsAndProfiles();
  const quotes = await db.quotations.toArray();
  const usedInQuote = new Set<string>();
  quotes.forEach((q: any) => (q.items ?? []).forEach((it: any) => it.sysId && usedInQuote.add(it.sysId)));
  await db.transaction('rw', [db.systems, db.profiles, db.glassTypes, db.accessories, db.windows, db.settings], async () => {
    const haveS = new Set((await db.systems.toCollection().primaryKeys()) as string[]);
    const haveP = new Set((await db.profiles.toCollection().primaryKeys()) as string[]);
    const haveG = new Set((await db.glassTypes.toCollection().primaryKeys()) as string[]);
    const haveA = new Set((await db.accessories.toCollection().primaryKeys()) as string[]);
    await db.systems.bulkAdd(systems.filter((x) => !haveS.has(x.id)));
    await db.profiles.bulkAdd(profiles.filter((x) => !haveP.has(x.id)));
    await db.glassTypes.bulkAdd(GLASS_TYPES.filter((x) => !haveG.has(x.id)));
    await db.accessories.bulkAdd(ACCESSORIES.filter((x) => !haveA.has(x.id)));
    for (const id of OLD_DEFAULT_SYSTEMS) {
      const s = await db.systems.get(id);
      if (!s) continue;
      const profs = await db.profiles.where('systemId').equals(id).toArray();
      const untouched = !s.verified && profs.every((p) => !p.purchasePerM && !p.sellPerM && !p.code) &&
        Object.entries(s.params).every(([k, val]) => !['sashAdd', 'mullionAdd', 'beadAdd', 'fixedGlassDeduct', 'sashRebate', 'sashGlassDeduct', 'weldAllow', 'reinfDeduct', 'cutAdj'].includes(k) || val === 0);
      const usedInWin = (await db.windows.where('systemId').equals(id).count()) > 0;
      if (untouched && !usedInWin && !usedInQuote.has(id)) {
        await db.profiles.where('systemId').equals(id).delete();
        await db.systems.delete(id);
      }
    }
    await db.settings.put({ key: 'seedVersion', value: SEED_VERSION });
  });
}

export async function setSetting(key: string, value: any) {
  await db.settings.put({ key, value });
}

export async function exportAll() {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await (db as any)[t].toArray();
  return { app: 'gz-aluminium', version: 1, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return 'Skedari nuk është JSON i vlefshëm.';
  if (obj.app !== 'gz-aluminium') return 'Ky skedar nuk është kopje rezervë e aplikacionit GZ Aluminium.';
  if (typeof obj.version !== 'number' || obj.version > 1) return 'Versioni i kopjes rezervë nuk mbështetet.';
  if (!obj.data || typeof obj.data !== 'object') return 'Mungojnë të dhënat.';
  for (const t of TABLES) {
    if (!Array.isArray(obj.data[t])) return `Mungon ose është i pavlefshëm seksioni "${t}".`;
  }
  const bad = (obj.data.windows as any[]).find((w) => typeof w.width !== 'number' || typeof w.height !== 'number' || !w.layout);
  if (bad) return 'Të dhëna të dëmtuara në dritaret (përmasa/konfigurim të pavlefshëm).';
  const badP = (obj.data.profiles as any[]).find((p) => typeof p.id !== 'string' || typeof p.purchasePerM !== 'number');
  if (badP) return 'Të dhëna të dëmtuara në profile.';
  return null;
}

export async function importAll(obj: any) {
  const err = validateBackup(obj);
  if (err) throw new Error(err);
  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    for (const t of TABLES) {
      await (db as any)[t].clear();
      if (obj.data[t].length) await (db as any)[t].bulkAdd(obj.data[t]);
    }
  });
}

export async function resetEverything() {
  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    for (const t of TABLES) await (db as any)[t].clear();
  });
  await ensureSeed();
}

export type { ColorDef, LaborRate, ProfileCategory };
