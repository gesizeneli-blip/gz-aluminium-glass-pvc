import type { Calc, ColorDef, Project, WindowItem } from '../types';
import { calcWindow, CalcCtx } from '../engine/calc';

export const QUOTE_STATUSES = ['Draft', 'Lëshuar', 'Pranuar', 'Refuzuar'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface QItem {
  win: WindowItem;
  sysId: string;
  sysName: string;
  sysMaterial: 'pvc' | 'alu';
  params: Record<string, number>;
  colorName: string;
  colorHex: string;
  glassLabels: Record<string, string>;
  calc: Calc;
  desc: string;
  /** line total (editable while Draft). Initialised from calc.price */
  price: number;
}

export interface QuotationRec {
  id?: number;
  number: string;
  projectId: number;
  projectName: string;
  client: { name: string; phone: string; email: string; address: string };
  status: QuoteStatus;
  date: string;
  validityDays: number;
  showPrices: boolean;
  showDrawings: boolean;
  notes: string;
  payment: string;
  discountPct: number;
  vatPct: number;
  business: { name: string; email: string; phone: string; instagram: string; nipt: string; address: string; signer: string };
  items: QItem[];
  createdAt: number;
  issuedAt?: number;
}

export function itemDescription(w: WindowItem, calc: Calc, sysName: string, colorName: string): string {
  const glasses = [...new Set(calc.glass.map((g) => g.composition || g.glassName))];
  const parts = [`${w.kind || 'Dritare'}`, `sistemi ${sysName}`, `ngjyra ${colorName}`];
  if (glasses.length) parts.push(`qelq: ${glasses.join(' / ')}`);
  if (w.shutter?.enabled) parts.push(`me roletë rrotulluese${w.shutter.motor ? ' me motor' : ''}`);
  if (w.nets && Object.values(w.nets).some(Boolean)) parts.push('me rrjetë');
  return parts.join(', ');
}

export function makeItems(windows: WindowItem[], ctx: CalcCtx, colors: ColorDef[]): QItem[] {
  return windows.map((w) => {
    const calc = calcWindow(w, ctx);
    const sys = ctx.systems.get(w.systemId);
    const col = colors.find((c) => c.name === w.color);
    const glassLabels: Record<string, string> = {};
    for (const g of calc.glass) glassLabels[g.cell] = `${g.w}×${g.h}`;
    const { id: _id, ...rest } = w;
    void _id;
    return {
      win: JSON.parse(JSON.stringify(rest)) as WindowItem,
      sysId: w.systemId,
      sysName: sys?.name ?? '?',
      sysMaterial: sys?.material ?? 'pvc',
      params: { ...(sys?.params ?? {}) },
      colorName: w.color,
      colorHex: col?.hex ?? '#f4f4f2',
      glassLabels,
      calc,
      desc: itemDescription(w, calc, sys?.name ?? '?', w.color),
      price: Math.round(calc.price)
    };
  });
}

export function snapshotQuotation(
  project: Project,
  windows: WindowItem[],
  ctx: CalcCtx,
  colors: ColorDef[],
  business: QuotationRec['business'],
  defaults: { validityDays: number; payment: string; notes: string; vatPct: number; showDrawings: boolean },
  number: string
): QuotationRec {
  return {
    number,
    projectId: project.id!,
    projectName: project.name,
    client: { name: project.clientName, phone: project.phone, email: project.email, address: project.address },
    status: 'Draft',
    date: new Date().toISOString().slice(0, 10),
    validityDays: defaults.validityDays,
    showPrices: true,
    showDrawings: defaults.showDrawings,
    notes: defaults.notes,
    payment: defaults.payment,
    discountPct: 0,
    vatPct: defaults.vatPct,
    business: { ...business },
    items: makeItems(windows, ctx, colors),
    createdAt: Date.now()
  };
}

export function nextNumber(existing: string[], date = new Date()): string {
  const y = date.getFullYear();
  const prefix = `GZ-${y}-`;
  let max = 0;
  for (const n of existing) {
    if (n.startsWith(prefix)) {
      const v = parseInt(n.slice(prefix.length), 10);
      if (!Number.isNaN(v)) max = Math.max(max, v);
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function quoteTotals(q: QuotationRec) {
  const subtotal = q.items.reduce((s, i) => s + (i.price || 0), 0);
  const discount = subtotal * ((q.discountPct || 0) / 100);
  const net = subtotal - discount;
  const vat = net * ((q.vatPct || 0) / 100);
  const grand = net + vat;
  const cost = q.items.reduce((s, i) => s + i.calc.costs.total, 0);
  const material = q.items.reduce((s, i) => s + i.calc.costs.material, 0);
  const units = q.items.reduce((s, i) => s + i.win.qty, 0);
  const area = q.items.reduce((s, i) => s + i.calc.area * i.win.qty, 0);
  return { subtotal, discount, net, vat, grand, cost, material, units, area, profit: net - cost };
}
