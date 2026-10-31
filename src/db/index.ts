import Dexie, { Table } from 'dexie';
import type {
  Accessory, Client, ColorDef, GlassType, LaborRate, Profile, ProfileCategory, Project, System, Template, WindowItem
} from '../types';
import { ACCESSORIES, buildSystemsAndProfiles, COLORS, DEFAULT_SETTINGS, GLASS_TYPES, LABOR_RATES, SEED_CATEGORIES } from './seed';
import type { QuotationRec } from '../lib/quotation';

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
  }
}

export const db = new GZDB();

export const TABLES = ['clients', 'projects', 'windows', 'systems', 'profiles', 'glassTypes', 'accessories', 'quotations', 'templates', 'settings'] as const;

export async function ensureSeed() {
  const done = await db.settings.get('seeded');
  if (done) return;
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
      { key: 'seeded', value: Date.now() }
    ]);
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
