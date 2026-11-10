import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db';
import { DEFAULT_SHUTTER_RATES } from '../types';
import type { Accessory, ColorDef, GlassType, LaborRate, Profile, ProfileCategory, System } from '../types';
import { CalcCtx, DEFAULT_CATEGORIES } from '../engine/calc';
import { DEFAULT_SETTINGS } from '../db/seed';

export interface Catalog {
  ready: boolean;
  systems: System[];
  profiles: Profile[];
  glassTypes: GlassType[];
  accessories: Accessory[];
  laborRates: LaborRate[];
  colors: ColorDef[];
  categories: ProfileCategory[];
  business: typeof DEFAULT_SETTINGS.business;
  quote: typeof DEFAULT_SETTINGS.quote;
  pdf: typeof DEFAULT_SETTINGS.pdf;
  appearance: typeof DEFAULT_SETTINGS.appearance;
  currency: typeof DEFAULT_SETTINGS.currency;
  ctx: CalcCtx;
}

export function useCatalog(): Catalog {
  const systems = useLiveQuery(() => db.systems.toArray(), []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), []);
  const glassTypes = useLiveQuery(() => db.glassTypes.toArray(), []);
  const accessories = useLiveQuery(() => db.accessories.toArray(), []);
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  return useMemo(() => {
    const ready = !!(systems && profiles && glassTypes && accessories && settings);
    const s = new Map((settings ?? []).map((r) => [r.key, r.value]));
    const laborRates: LaborRate[] = s.get('laborRates') ?? [];
    const categories: ProfileCategory[] = s.get('categories') ?? DEFAULT_CATEGORIES;
    const sy = systems ?? [], pr = profiles ?? [], gl = glassTypes ?? [], ac = accessories ?? [];
    return {
      ready, systems: sy, profiles: pr, glassTypes: gl, accessories: ac, laborRates,
      colors: s.get('colors') ?? [],
      categories,
      business: { ...DEFAULT_SETTINGS.business, ...(s.get('business') ?? {}) },
      quote: { ...DEFAULT_SETTINGS.quote, ...(s.get('quote') ?? {}) },
      pdf: { ...DEFAULT_SETTINGS.pdf, ...(s.get('pdf') ?? {}) },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...(s.get('appearance') ?? {}) },
      currency: { ...DEFAULT_SETTINGS.currency, ...(s.get('currency') ?? {}) },
      ctx: {
        systems: new Map(sy.map((x) => [x.id, x])),
        profiles: new Map(pr.map((x) => [x.id, x])),
        glass: new Map(gl.map((x) => [x.id, x])),
        acc: new Map(ac.map((x) => [x.id, x])),
        labor: laborRates,
        categories,
        shutter: { ...DEFAULT_SHUTTER_RATES, ...(s.get('shutter') ?? {}) }
      }
    };
  }, [systems, profiles, glassTypes, accessories, settings]);
}
