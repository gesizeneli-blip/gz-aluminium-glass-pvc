import type { Layout, OpenType } from '../types';

export interface GCell {
  key: string; // "col-row" (1-based)
  col: number;
  row: number;
  x: number; // aperture top-left from outer window corner (mm)
  y: number;
  cw: number; // aperture width
  ch: number; // aperture height
  open: OpenType;
}
export interface GMullion {
  x: number;
  y: number;
  len: number;
  col?: number;
}
export interface Geometry {
  cells: GCell[];
  mullV: GMullion[];
  mullH: GMullion[];
  innerW: number;
  innerH: number;
  warnings: string[];
}

const MIN_SIZE = 50;

export function distribute(total: number, specs: (number | undefined)[]): { sizes: number[]; warn: boolean } {
  const n = specs.length;
  if (n === 0) return { sizes: [], warn: false };
  const fixedSum = specs.reduce<number>((s, v) => s + (v && v > 0 ? v : 0), 0);
  const nAuto = specs.filter((v) => !(v && v > 0)).length;
  let warn = false;
  if (nAuto === 0) {
    if (Math.abs(fixedSum - total) < 0.5) return { sizes: specs.map((v) => v as number), warn: false };
    warn = true;
    return { sizes: specs.map((v) => ((v as number) / fixedSum) * total), warn };
  }
  const rem = total - fixedSum;
  if (rem < MIN_SIZE * nAuto) {
    warn = true;
    // scale everything proportionally using an average for auto entries
    const avg = fixedSum / Math.max(1, n - nAuto) || total / n;
    const raw = specs.map((v) => (v && v > 0 ? v : avg));
    const s = raw.reduce((a, b) => a + b, 0);
    return { sizes: raw.map((v) => (v / s) * total), warn };
  }
  const each = rem / nAuto;
  return { sizes: specs.map((v) => (v && v > 0 ? v : each)), warn };
}

export function computeGeometry(
  W: number,
  H: number,
  layout: Layout,
  params: Record<string, number>
): Geometry {
  const fw = params.frameW ?? 0;
  const mw = params.mullionW ?? 0;
  const warnings: string[] = [];
  const cols = layout.columns.length ? layout.columns : [{ cells: [{ open: 'fixed' as OpenType }] }];
  const innerW = W - 2 * fw;
  const innerH = H - 2 * fw;
  const availW = innerW - (cols.length - 1) * mw;
  const dw = distribute(availW, cols.map((c) => c.w));
  if (dw.warn) warnings.push('Gjerësitë e kolonave nuk përputhen me përmasën; u rregulluan proporcionalisht.');
  const cells: GCell[] = [];
  const mullV: GMullion[] = [];
  const mullH: GMullion[] = [];
  let x = fw;
  cols.forEach((col, ci) => {
    const cw = dw.sizes[ci];
    const rows = col.cells.length ? col.cells : [{ open: 'fixed' as OpenType }];
    const availH = innerH - (rows.length - 1) * mw;
    const dh = distribute(availH, rows.map((r) => r.h));
    if (dh.warn) warnings.push(`Lartësitë në kolonën ${ci + 1} nuk përputhen; u rregulluan proporcionalisht.`);
    let y = fw;
    rows.forEach((r, ri) => {
      const ch = dh.sizes[ri];
      cells.push({ key: `${ci + 1}-${ri + 1}`, col: ci + 1, row: ri + 1, x, y, cw, ch, open: r.open });
      y += ch;
      if (ri < rows.length - 1) {
        mullH.push({ x, y, len: cw, col: ci + 1 });
        y += mw;
      }
    });
    x += cw;
    if (ci < cols.length - 1) {
      mullV.push({ x, y: fw, len: innerH });
      x += mw;
    }
  });
  if (innerW <= 0 || innerH <= 0) warnings.push('Përmasat janë shumë të vogla për kasën.');
  return { cells, mullV, mullH, innerW, innerH, warnings };
}

export const isSash = (o: OpenType) => o !== 'fixed';

export function matchClass(o: OpenType): 'fixed' | 'turn' | 'tilt-turn' | 'tilt' | 'slide' | 'door' {
  if (o === 'fixed') return 'fixed';
  if (o.startsWith('turn')) return 'turn';
  if (o.startsWith('tilt-turn')) return 'tilt-turn';
  if (o === 'tilt') return 'tilt';
  if (o.startsWith('slide')) return 'slide';
  return 'door';
}

/* ---------- Layout presets ---------- */
const c = (open: OpenType, h?: number) => ({ open, h });
export interface Preset {
  key: string;
  name: string;
  layout: Layout;
}
export const PRESETS: Preset[] = [
  { key: 'fixed', name: 'Dritare fikse e vetme', layout: { columns: [{ cells: [c('fixed')] }] } },
  { key: 'single-turn', name: 'Dritare me një krah (hapje)', layout: { columns: [{ cells: [c('turn-left')] }] } },
  {
    key: 'double-turn',
    name: 'Dritare me dy krahë (hapje)',
    layout: { columns: [{ cells: [c('turn-left')] }, { cells: [c('turn-right')] }] }
  },
  { key: 'tilt-turn', name: 'Anim + hapje (Tilt & Turn)', layout: { columns: [{ cells: [c('tilt-turn-right')] }] } },
  { key: 'tilt', name: 'Vetëm anim (Tilt)', layout: { columns: [{ cells: [c('tilt')] }] } },
  {
    key: 'fixed-open',
    name: 'Fikse + hapje',
    layout: { columns: [{ cells: [c('fixed')] }, { cells: [c('tilt-turn-right')] }] }
  },
  {
    key: 'open-fixed',
    name: 'Hapje + fikse',
    layout: { columns: [{ cells: [c('tilt-turn-left')] }, { cells: [c('fixed')] }] }
  },
  {
    key: 'three',
    name: 'Dritare me tre pjesë (fikse + hapje + fikse)',
    layout: { columns: [{ cells: [c('fixed')] }, { cells: [c('tilt-turn-right')] }, { cells: [c('fixed')] }] }
  },
  {
    key: 'three-open',
    name: 'Tre pjesë (hapje + fikse + hapje)',
    layout: { columns: [{ cells: [c('turn-left')] }, { cells: [c('fixed')] }, { cells: [c('turn-right')] }] }
  },
  {
    key: 'transom',
    name: 'Hapje me fikse sipër',
    layout: { columns: [{ cells: [c('fixed', 400), c('tilt-turn-right')] }] }
  },
  {
    key: 'sliding',
    name: 'Rrëshqitëse me dy krahë',
    layout: { columns: [{ cells: [c('slide-right')] }, { cells: [c('slide-left')] }] }
  },
  {
    key: 'balcony',
    name: 'Derë ballkoni',
    layout: { columns: [{ cells: [c('door-right')] }] }
  },
  {
    key: 'balcony-fixed',
    name: 'Derë ballkoni + fikse anësore',
    layout: { columns: [{ cells: [c('door-left')] }, { w: 600, cells: [c('fixed')] }] }
  },
  {
    key: 'entrance',
    name: 'Derë hyrëse',
    layout: { columns: [{ cells: [c('door-left')] }] }
  },
  {
    key: 'entrance-top',
    name: 'Derë hyrëse me fikse sipër',
    layout: { columns: [{ cells: [c('fixed', 500), c('door-left')] }] }
  }
];
