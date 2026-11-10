import type {
  Accessory,
  AccRow,
  Calc,
  CostBreakdown,
  GlassRow,
  GlassType,
  LaborRate,
  MeterRow,
  PieceRow,
  Profile,
  ProfileCategory,
  ProfileUse,
  System,
  WindowItem
} from '../types';
import { evaluate } from './formula';
import { computeGeometry, isSash, matchClass, GCell, Geometry } from './geometry';
import type { AddonRow, ShutterRates } from '../types';
import { DEFAULT_SHUTTER_RATES } from '../types';
import { isShaped, segments, shapePerimeter, normalizeShape } from './shapes';

export interface CalcCtx {
  systems: Map<string, System>;
  profiles: Map<string, Profile>;
  glass: Map<string, GlassType>;
  acc: Map<string, Accessory>;
  labor: LaborRate[];
  categories: ProfileCategory[];
  shutter?: ShutterRates;
}

export const DEFAULT_CATEGORIES: ProfileCategory[] = [
  { key: 'frame', label: 'Kasë', group: 'profile' },
  { key: 'sash', label: 'Kanat', group: 'profile' },
  { key: 'mullion', label: 'Montant / ndarëse', group: 'profile' },
  { key: 'bead', label: 'Fiksim qelqi (bead)', group: 'profile' },
  { key: 'reinforcement', label: 'Armaturë çeliku', group: 'reinforcement' },
  { key: 'gasket', label: 'Garniturë', group: 'gasket' },
  { key: 'connector', label: 'Lidhëse / tjetër', group: 'profile' }
];

export const effBarLength = (p: Profile) => (p.customBarLength && p.customBarLength > 0 ? p.customBarLength : p.barLength);

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const emptyCosts = (): CostBreakdown => ({
  profiles: 0, reinforcement: 0, glass: 0, accessories: 0, gaskets: 0, labor: 0, other: 0, material: 0, total: 0
});

export function emptyCalc(w: WindowItem, errors: string[] = []): Calc {
  return {
    qty: w.qty, area: 0, perimeter: 0, errors, warnings: [], pieces: [], meters: [], profileUse: [], glass: [],
    accessories: [], costs: emptyCosts(), materialSell: 0, extrasPrice: 0, price: 0, profit: 0, marginPct: 0,
    profitPerM2: 0, profitPerUnit: 0
  };
}

/** Glass dimensions of a cell using the system's editable formulas. */
export function glassSize(
  sys: System,
  cell: GCell,
  W: number,
  H: number
): { gw: number; gh: number; vars: Record<string, number> } {
  const p = sys.params;
  const sash = isSash(cell.open);
  const vars: Record<string, number> = {
    ...p,
    W, H,
    CW: cell.cw,
    CH: cell.ch,
    SW: cell.cw + (p.sashAdd ?? 0),
    SH: cell.ch + (p.sashAdd ?? 0)
  };
  const fw = sash ? sys.glassFormulas.sashW : sys.glassFormulas.fixedW;
  const fh = sash ? sys.glassFormulas.sashH : sys.glassFormulas.fixedH;
  const gw = Math.round(evaluate(fw, vars));
  const gh = Math.round(evaluate(fh, vars));
  vars.GW = gw;
  vars.GH = gh;
  return { gw, gh, vars };
}

/** Roller shutter (curtain area W x H + optional motor) and insect screens (aperture area of the marked cells). */
export function shutterAddons(w: WindowItem, ctx: CalcCtx, geom: Geometry): AddonRow[] {
  const r: ShutterRates = { ...DEFAULT_SHUTTER_RATES, ...(ctx.shutter ?? {}) };
  const rows: AddonRow[] = [];
  const sh = w.shutter;
  if (sh?.enabled) {
    const area = Math.max(r.minArea, (w.width * w.height) / 1e6);
    rows.push({ label: `Roletë rrotulluese (${Math.round(w.width)}×${Math.round(w.height)} mm)`, qty: Math.round(area * 1000) / 1000, unit: 'm²', cost: area * r.costM2, sell: area * r.sellM2 });
    if (sh.motor) rows.push({ label: 'Motor për roletën', qty: 1, unit: 'copë', cost: r.motorCost, sell: r.motorSell });
  }
  const netCells = geom.cells.filter((c) => w.nets?.[c.key]);
  if (netCells.length) {
    const area = netCells.reduce((a, c) => a + (c.cw * c.ch) / 1e6, 0);
    rows.push({ label: `Rrjetë kundër insekteve (${netCells.length} pjesë)`, qty: Math.round(area * 1000) / 1000, unit: 'm²', cost: area * r.netCostM2, sell: area * r.netSellM2 });
  }
  return rows;
}

export function calcWindow(w: WindowItem, ctx: CalcCtx): Calc {
  const sys = ctx.systems.get(w.systemId);
  if (!sys) return emptyCalc(w, ['Sistemi i profileve nuk është zgjedhur ose nuk ekziston.']);
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = w.width;
  const H = w.height;
  if (!(W > 0) || !(H > 0)) return emptyCalc(w, ['Gjerësia dhe lartësia duhet të jenë më të mëdha se 0.']);
  const qty = Math.max(1, Math.floor(w.qty || 1));
  const shaped = isShaped(w.shape);
  let geom: Geometry;
  if (shaped) {
    const fw0 = sys.params.frameW ?? 0;
    geom = {
      cells: [{ key: '1-1', col: 1, row: 1, x: fw0, y: fw0, cw: W - 2 * fw0, ch: H - 2 * fw0, open: 'fixed' }],
      mullV: [], mullH: [], innerW: W - 2 * fw0, innerH: H - 2 * fw0, warnings: []
    };
    warnings.push(...normalizeShape(W, H, w.shape!).warnings);
    warnings.push('Formë jo-drejtkëndëshe: qelqi dhe çmimi llogariten sipas drejtkëndëshit rreth formës; profili i kasës ndahet sipas segmenteve (kënde të ndryshme prerjeje, kontrolloji); nuk ka kanate ose ndarje.');
  } else {
    geom = computeGeometry(W, H, w.layout, sys.params);
    warnings.push(...geom.warnings);
  }
  const area = (W * H) / 1e6;
  const perimeter = (2 * (W + H)) / 1000;

  const pieces: PieceRow[] = [];
  const meters: MeterRow[] = [];
  const base = { ...sys.params, W, H, nCols: w.layout.columns.length };

  const cellVars = (cell: GCell) => {
    const g = glassSize(sys, cell, W, H);
    return { ...g.vars, nRows: w.layout.columns[cell.col - 1]?.cells.length ?? 1 };
  };

  const shapedSeen = new Set<string>();
  for (const line of sys.recipe) {
    if (!line.enabled || w.lineOff[line.id]) continue;
    const prof = ctx.profiles.get(line.profileId);
    if (!prof) {
      errors.push(`Rreshti "${line.label}": profili nuk është caktuar.`);
      continue;
    }
    if (shaped && (line.scope === 'window' || line.scope === 'cell' || line.scope === 'fixed')) {
      try {
        const per = shapePerimeter(W, H, w.shape!);
        if (line.kind === 'meter') {
          if (line.scope !== 'window') continue;
          const m = evaluate(line.lengthFormula, { ...base, W: per / 4, H: per / 4 });
          meters.push({ lineId: line.id, profileId: line.profileId, label: line.label, meters: m / 1000 });
        } else {
          // one piece per frame segment, using the first recipe line of each profile
          const key = `${line.profileId}|${line.scope === 'window' ? 'w' : 'c'}`;
          if (shapedSeen.has(key)) continue;
          shapedSeen.add(key);
          for (const seg of segments(W, H, w.shape!)) {
            const v = { ...base, W: seg.len, H: seg.len, CW: seg.len, CH: seg.len, SW: seg.len, SH: seg.len, GW: seg.len, GH: seg.len, MH: seg.len, nRows: 1 };
            const len = evaluate(line.lengthFormula, v);
            if (len > 0) pieces.push({ lineId: line.id, profileId: line.profileId, label: `${line.label.split(' – ')[0]} – ${seg.label}`, length: r1(len), qty: 1 });
          }
        }
      } catch (e) {
        errors.push(`Rreshti "${line.label}": ${(e as Error).message}`);
      }
      continue;
    }
    const contexts: { vars: Record<string, number>; cell?: string }[] = [];
    try {
      if (line.scope === 'window') contexts.push({ vars: base });
      else if (line.scope === 'mullionV') geom.mullV.forEach((m, i) => contexts.push({ vars: { ...base, MH: m.len }, cell: `mV${i + 1}` }));
      else if (line.scope === 'mullionH') geom.mullH.forEach((m, i) => contexts.push({ vars: { ...base, MH: m.len, CW: m.len }, cell: `mH${i + 1}` }));
      else {
        for (const cell of geom.cells) {
          if (line.scope === 'sash' && !isSash(cell.open)) continue;
          if (line.scope === 'fixed' && isSash(cell.open)) continue;
          contexts.push({ vars: cellVars(cell), cell: cell.key });
        }
      }
    } catch (e) {
      errors.push(`Formula e qelqit: ${(e as Error).message}`);
      continue;
    }
    for (const ctxv of contexts) {
      try {
        const len = evaluate(line.lengthFormula, ctxv.vars);
        const q = evaluate(line.qtyFormula, ctxv.vars);
        if (q <= 0) continue;
        if (line.kind === 'meter') {
          meters.push({ lineId: line.id, profileId: line.profileId, label: line.label, meters: (len * q) / 1000 });
        } else {
          if (len <= 0) {
            warnings.push(`Rreshti "${line.label}" ka gjatësi ≤ 0 (${r1(len)} mm) dhe u anashkalua.`);
            continue;
          }
          pieces.push({ lineId: line.id, profileId: line.profileId, label: line.label, length: r1(len), qty: Math.round(q), cell: ctxv.cell });
        }
      } catch (e) {
        errors.push(`Rreshti "${line.label}": ${(e as Error).message}`);
        break;
      }
    }
  }
  for (const ep of w.extraPieces) {
    if (ep.length > 0 && ep.qty > 0 && ctx.profiles.has(ep.profileId)) {
      pieces.push({ lineId: 'manual', profileId: ep.profileId, label: ep.label || 'Shtesë manuale', length: ep.length, qty: ep.qty, manual: true });
    }
  }

  /* merge identical piece rows for readability */
  const mergedMap = new Map<string, PieceRow>();
  for (const p of pieces) {
    const k = `${p.lineId}|${p.profileId}|${p.length}|${p.cell ?? ''}`;
    const e = mergedMap.get(k);
    if (e) e.qty += p.qty;
    else mergedMap.set(k, { ...p });
  }
  const mergedPieces = [...mergedMap.values()];

  /* profile use */
  const catMap = new Map(ctx.categories.map((c) => [c.key, c]));
  const useMap = new Map<string, ProfileUse>();
  const getUse = (pid: string): ProfileUse | undefined => {
    let u = useMap.get(pid);
    if (u) return u;
    const prof = ctx.profiles.get(pid);
    if (!prof) return undefined;
    u = {
      profileId: pid, name: prof.name, category: prof.category,
      group: catMap.get(prof.category)?.group ?? 'profile',
      mm: 0, meters: 0, pieces: 0, cost: 0, sell: 0
    };
    useMap.set(pid, u);
    return u;
  };
  for (const p of mergedPieces) {
    const u = getUse(p.profileId);
    if (!u) continue;
    u.mm += p.length * p.qty;
    u.pieces += p.qty;
  }
  for (const m of meters) {
    const u = getUse(m.profileId);
    if (!u) continue;
    u.mm += m.meters * 1000;
  }
  for (const u of useMap.values()) {
    const prof = ctx.profiles.get(u.profileId)!;
    u.meters = u.mm / 1000;
    const f = 1 + (prof.wastePct || 0) / 100;
    u.cost = u.meters * f * prof.purchasePerM;
    u.sell = u.meters * f * prof.sellPerM;
  }
  const profileUse = [...useMap.values()];

  /* glass */
  const glassRows: GlassRow[] = [];
  for (const cell of geom.cells) {
    try {
      const { gw, gh } = glassSize(sys, cell, W, H);
      if (gw <= 0 || gh <= 0) {
        warnings.push(`Qelqi në pjesën ${cell.key} ka përmasa ≤ 0.`);
        continue;
      }
      const gid = w.cellGlass[cell.key] || w.glassId;
      const gt = ctx.glass.get(gid);
      if (!gt) {
        errors.push(`Pjesa ${cell.key}: lloji i qelqit nuk është zgjedhur.`);
        continue;
      }
      const a = (gw * gh) / 1e6;
      const billed = Math.max(a, gt.minArea || 0);
      glassRows.push({
        cell: cell.key, open: cell.open, glassId: gt.id, glassName: gt.name, composition: gt.composition,
        thickness: gt.thickness, w: gw, h: gh, area: r2(a * 1e4) / 1e4, billedArea: billed, qty: 1,
        cost: billed * gt.purchasePerM2, sell: billed * gt.sellPerM2
      });
    } catch (e) {
      errors.push(`Formula e qelqit (pjesa ${cell.key}): ${(e as Error).message}`);
    }
  }

  /* accessories */
  const accAuto = new Map<string, number>();
  for (const line of sys.accRecipe) {
    if (!line.enabled) continue;
    const add = (vars: Record<string, number>) => {
      try {
        const q = evaluate(line.qtyFormula, vars);
        if (q > 0) accAuto.set(line.accessoryId, (accAuto.get(line.accessoryId) ?? 0) + q);
      } catch (e) {
        errors.push(`Aksesor "${line.label}": ${(e as Error).message}`);
      }
    };
    if (line.match === 'window') add(base);
    else {
      for (const cell of geom.cells) {
        const cls = matchClass(cell.open);
        if (line.match === 'any-sash' ? cls !== 'fixed' : line.match === cls) {
          try { add(cellVars(cell)); } catch (e) { errors.push(`Formula e qelqit: ${(e as Error).message}`); }
        }
      }
    }
  }
  const accIds = new Set<string>([...accAuto.keys(), ...Object.keys(w.accQty)]);
  const accRows: AccRow[] = [];
  for (const id of accIds) {
    const a = ctx.acc.get(id);
    if (!a) continue;
    const auto = accAuto.get(id) ?? 0;
    const manual = id in w.accQty;
    const q = manual ? w.accQty[id] : auto;
    if (q <= 0) continue;
    accRows.push({ accessoryId: id, name: a.name, unit: a.unit, autoQty: auto, qty: q, manual, cost: q * a.purchase, sell: q * a.sell });
  }

  /* costs per unit */
  const c = emptyCosts();
  let matSell = 0;
  for (const u of profileUse) {
    if (u.group === 'reinforcement') c.reinforcement += u.cost;
    else if (u.group === 'gasket') c.gaskets += u.cost;
    else c.profiles += u.cost;
    matSell += u.sell;
  }
  for (const g of glassRows) { c.glass += g.cost; matSell += g.sell; }
  for (const a of accRows) { c.accessories += a.cost; matSell += a.sell; }
  for (const lr of ctx.labor) {
    if (!w.laborIds.includes(lr.id)) continue;
    c.labor += lr.rate * (lr.unit === 'm2' ? area : lr.unit === 'ml' ? perimeter : 1);
  }
  const addons = shutterAddons(w, ctx, geom);
  const addCost = addons.reduce((a, r) => a + r.cost, 0);
  const addSell = addons.reduce((a, r) => a + r.sell, 0);
  const extrasCostUnit = w.extras.reduce((s, e) => s + (e.cost || 0), 0) + addCost;
  const extrasPriceUnit = w.extras.reduce((s, e) => s + (e.price || 0), 0) + addSell;
  c.other += extrasCostUnit;
  c.material = c.profiles + c.reinforcement + c.glass + c.accessories + c.gaskets;
  c.total = c.material + c.labor + c.other;

  const costs: CostBreakdown = {
    profiles: c.profiles * qty, reinforcement: c.reinforcement * qty, glass: c.glass * qty,
    accessories: c.accessories * qty, gaskets: c.gaskets * qty, labor: c.labor * qty, other: c.other * qty,
    material: c.material * qty, total: c.total * qty
  };
  const materialSell = matSell * qty;
  const extrasPrice = extrasPriceUnit * qty;

  /* selling price */
  const pr = w.pricing;
  let price = 0;
  switch (pr.method) {
    case 'm2': price = pr.unitPrice * area * qty; break;
    case 'ml': price = pr.unitPrice * perimeter * qty; break;
    case 'unit': price = pr.unitPrice * qty; break;
    case 'manual': price = pr.manualTotal; break;
    case 'sellList': price = materialSell + (costs.labor + costs.other) * (1 + pr.marginPct / 100); break;
    case 'margin': price = costs.total * (1 + pr.marginPct / 100); break;
  }
  if (pr.method !== 'manual') price += extrasPrice;
  const profit = price - costs.total;
  const totalArea = area * qty;
  return {
    qty, area, perimeter, errors, warnings,
    pieces: mergedPieces, meters, profileUse, glass: glassRows, accessories: accRows, addons,
    costs, materialSell, extrasPrice, price, profit,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
    profitPerM2: totalArea > 0 ? profit / totalArea : 0,
    profitPerUnit: profit / qty
  };
}

export interface Totals {
  windows: number; // total units
  area: number;
  cost: CostBreakdown;
  price: number;
  profit: number;
  marginPct: number;
  profitPerM2: number;
}
export function sumCalcs(calcs: Calc[]): Totals {
  const cost = emptyCosts();
  let windows = 0, area = 0, price = 0;
  for (const c of calcs) {
    windows += c.qty;
    area += c.area * c.qty;
    price += c.price;
    (Object.keys(cost) as (keyof CostBreakdown)[]).forEach((k) => (cost[k] += c.costs[k]));
  }
  const profit = price - cost.total;
  return { windows, area, cost, price, profit, marginPct: price > 0 ? (profit / price) * 100 : 0, profitPerM2: area > 0 ? profit / area : 0 };
}

/** Aggregates bar pieces (multiplied by window qty) per profile for cutting optimization. */
export function aggregatePieces(
  items: { w: WindowItem; calc: Calc }[]
): Map<string, { length: number; tag: string }[]> {
  const out = new Map<string, { length: number; tag: string }[]>();
  for (const { w, calc } of items) {
    for (const p of calc.pieces) {
      const arr = out.get(p.profileId) ?? [];
      for (let i = 0; i < p.qty * calc.qty; i++) arr.push({ length: p.length, tag: w.name });
      out.set(p.profileId, arr);
    }
  }
  return out;
}
