import type { Layout, OpenType, SystemMode } from '../types';

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
  const tr = layout.transom && layout.transom.h > 0 ? layout.transom : undefined;
  const trH = tr ? Math.min(tr.h, Math.max(0, innerH - mw - MIN_SIZE)) : 0;
  const colTop = tr ? fw + trH + mw : fw;
  const colH = tr ? innerH - trH - mw : innerH;
  const availW = innerW - (cols.length - 1) * mw;
  const dw = distribute(availW, cols.map((c) => c.w));
  if (dw.warn) warnings.push('Gjerësitë e kolonave nuk përputhen me përmasën; u rregulluan proporcionalisht.');
  const cells: GCell[] = [];
  const mullV: GMullion[] = [];
  const mullH: GMullion[] = [];
  if (tr) {
    cells.push({ key: 'T', col: 0, row: 1, x: fw, y: fw, cw: innerW, ch: trH, open: tr.open });
    mullH.push({ x: fw, y: fw + trH, len: innerW });
  }
  let x = fw;
  cols.forEach((col, ci) => {
    const cw = dw.sizes[ci];
    const rows = col.cells.length ? col.cells : [{ open: 'fixed' as OpenType }];
    const availH = colH - (rows.length - 1) * mw;
    const dh = distribute(availH, rows.map((r) => r.h));
    if (dh.warn) warnings.push(`Lartësitë në kolonën ${ci + 1} nuk përputhen; u rregulluan proporcionalisht.`);
    let y = colTop;
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
      mullV.push({ x, y: colTop, len: colH });
      x += mw;
    }
  });
  if (innerW <= 0 || innerH <= 0) warnings.push('Përmasat janë shumë të vogla për kasën.');
  return { cells, mullV, mullH, innerW, innerH, warnings };
}

export const isSash = (o: OpenType) => o !== 'fixed';

export function matchClass(o: OpenType): 'fixed' | 'turn' | 'tilt-turn' | 'tilt' | 'slide' | 'fold' | 'door' {
  if (o === 'fixed') return 'fixed';
  if (o.startsWith('fold')) return 'fold';
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
  /** system modes this preset is offered for (default: swing + door) */
  modes?: SystemMode[];
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
    modes: ['slide'],
    name: 'Rrëshqitëse me dy krahë',
    layout: { columns: [{ cells: [c('slide-right')] }, { cells: [c('slide-left')] }] }
  },
  {
    key: 'balcony',
    modes: ['swing', 'door'],
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

/* ---------- Multi-sash builders (number of sashes depends on the size) ---------- */
export const MAX_SASHES = 8;

/** Suggest the number of sashes from the width and the largest comfortable sash width. */
export function suggestSashCount(W: number, maxSashW: number): number {
  if (!(maxSashW > 0) || !(W > 0)) return 1;
  return Math.max(1, Math.min(MAX_SASHES, Math.ceil(W / maxSashW)));
}

/** n movable sliding sashes, alternating direction (S350 style). */
export function slidingLayout(n: number): Layout {
  const k = Math.max(1, Math.min(MAX_SASHES, Math.round(n)));
  return { columns: Array.from({ length: k }, (_, i) => ({ cells: [c(i % 2 === 0 ? 'slide-right' : 'slide-left')] })) };
}
/** Fixed side + movable sashes (S560 "fikse anësore + e lëvizshme"). */
export function slidingFixedSide(n: number, side: 'left' | 'right' = 'left'): Layout {
  const k = Math.max(1, Math.min(MAX_SASHES - 1, Math.round(n)));
  const mov = Array.from({ length: k }, (_, i) => ({ cells: [c(i % 2 === 0 ? 'slide-left' : 'slide-right')] }));
  const fx = { cells: [c('fixed')] };
  return { columns: side === 'left' ? [fx, ...mov] : [...mov, fx] };
}
/** n side-by-side turning sashes (PVC / alumin with 2+ sashes). */
export function turnLayout(n: number): Layout {
  const k = Math.max(1, Math.min(MAX_SASHES, Math.round(n)));
  return { columns: Array.from({ length: k }, (_, i) => ({ cells: [c(k === 1 ? 'tilt-turn-right' : i % 2 === 0 ? 'tilt-turn-left' : 'turn-right')] })) };
}
/** Bifold: n panels folding to one side. */
export function foldLayout(n: number, side: 'left' | 'right' = 'right'): Layout {
  const k = Math.max(2, Math.min(MAX_SASHES, Math.round(n)));
  return { columns: Array.from({ length: k }, () => ({ cells: [c(side === 'right' ? 'fold-right' : 'fold-left')] })) };
}
/** n fixed glass panels side by side. */
export function fixedPanels(n: number): Layout {
  const k = Math.max(1, Math.min(MAX_SASHES, Math.round(n)));
  return { columns: Array.from({ length: k }, () => ({ cells: [c('fixed')] })) };
}
/** Fixed glass panel(s) with a hinged glass door at the end. */
export function glassWithDoor(nFixed: number, doorSide: 'left' | 'right' = 'right'): Layout {
  const k = Math.max(0, Math.min(MAX_SASHES - 1, Math.round(nFixed)));
  const fx = Array.from({ length: k }, () => ({ cells: [c('fixed')] }));
  const door = { cells: [c(doorSide === 'right' ? 'door-left' : 'door-right')] };
  return { columns: doorSide === 'right' ? [...fx, door] : [door, ...fx] };
}

/** Which kind of "N sashes" builder a system mode supports (UI helper). */
export type MultiKind = 'turn' | 'slide' | 'slide-fixed' | 'fold' | 'panels' | 'panels-door';
export const MULTI_BY_MODE: Record<SystemMode, { kind: MultiKind; label: string; unit: string }[]> = {
  swing: [{ kind: 'turn', label: 'Kanate me hapje', unit: 'kanate' }],
  door: [{ kind: 'panels-door', label: 'Fikse + derë', unit: 'fikse' }],
  slide: [
    { kind: 'slide', label: 'Të gjitha të lëvizshme', unit: 'kanate' },
    { kind: 'slide-fixed', label: 'Fikse anësore + të lëvizshme', unit: 'të lëvizshme' }
  ],
  fold: [{ kind: 'fold', label: 'Panele palosëse', unit: 'panele' }],
  fixed: [{ kind: 'panels', label: 'Panele fikse', unit: 'panele' }]
};
export function buildMulti(kind: MultiKind, n: number): Layout {
  switch (kind) {
    case 'turn': return turnLayout(n);
    case 'slide': return slidingLayout(n);
    case 'slide-fixed': return slidingFixedSide(n);
    case 'fold': return foldLayout(n);
    case 'panels': return fixedPanels(n);
    default: return glassWithDoor(n);
  }
}

export function presetsFor(mode: SystemMode | undefined): Preset[] {
  const m: SystemMode = mode ?? 'swing';
  return PRESETS.filter((p) => (p.modes ?? ['swing', 'door']).includes(m));
}

/* ---------- Extra presets per system mode ---------- */
PRESETS.push(
  { key: 'slide-2', modes: ['slide'], name: 'Rrëshqitëse – 2 kanate të lëvizshme', layout: slidingLayout(2) },
  { key: 'slide-3', modes: ['slide'], name: 'Rrëshqitëse – 3 kanate', layout: slidingLayout(3) },
  { key: 'slide-4', modes: ['slide'], name: 'Rrëshqitëse – 4 kanate', layout: slidingLayout(4) },
  { key: 'slide-fixed-1', modes: ['slide'], name: 'Fikse anësore + 1 e lëvizshme', layout: slidingFixedSide(1) },
  { key: 'slide-fixed-2', modes: ['slide'], name: 'Fikse anësore + 2 të lëvizshme', layout: slidingFixedSide(2) },
  { key: 'fold-3', modes: ['fold'], name: 'Palosje – 3 panele', layout: foldLayout(3) },
  { key: 'fold-4', modes: ['fold'], name: 'Palosje – 4 panele', layout: foldLayout(4) },
  { key: 'fold-5', modes: ['fold'], name: 'Palosje – 5 panele', layout: foldLayout(5) },
  { key: 'fold-6', modes: ['fold'], name: 'Palosje – 6 panele', layout: foldLayout(6) },
  { key: 'panel-1', modes: ['fixed'], name: 'Një panel fiks (xham / pasqyrë)', layout: fixedPanels(1) },
  { key: 'panel-2', modes: ['fixed'], name: '2 panele fikse', layout: fixedPanels(2) },
  { key: 'panel-3', modes: ['fixed'], name: '3 panele fikse', layout: fixedPanels(3) },
  { key: 'glass-door', modes: ['door'], name: 'Derë xhami (menteshë sipër + poshtë)', layout: { columns: [{ cells: [{ open: 'door-left' as OpenType }] }] } },
  { key: 'glass-door-fixed', modes: ['door'], name: 'Derë xhami + fiks anësor', layout: glassWithDoor(1) }
);

/* ---------- Exterior door presets (panel doors) ---------- */
PRESETS.push(
  { key: 'transom-2col', name: 'Fikse sipër (e plotë) + dy pjesë poshtë', layout: { transom: { h: 300, open: 'fixed' as OpenType }, columns: [{ w: 470, cells: [{ open: 'fixed' as OpenType }] }, { cells: [{ open: 'fixed' as OpenType }] }] } },
  { key: 'ext-door', modes: ['door'], name: 'Derë e jashtme – një krah', layout: { columns: [{ cells: [{ open: 'door-right' as OpenType }] }] } },
  { key: 'ext-door-side-r', modes: ['door'], name: 'Derë + anësor fiks djathtas', layout: { columns: [{ cells: [{ open: 'door-right' as OpenType }] }, { w: 400, cells: [{ open: 'fixed' as OpenType }] }] } },
  { key: 'ext-door-side-l', modes: ['door'], name: 'Anësor fiks majtas + derë', layout: { columns: [{ w: 400, cells: [{ open: 'fixed' as OpenType }] }, { cells: [{ open: 'door-left' as OpenType }] }] } },
  { key: 'ext-door-double', modes: ['door'], name: 'Derë me dy krahë', layout: { columns: [{ cells: [{ open: 'door-left' as OpenType }] }, { cells: [{ open: 'door-right' as OpenType }] }] } },
  { key: 'ext-door-top', modes: ['door'], name: 'Derë me xham fiks sipër', layout: { columns: [{ cells: [{ open: 'fixed' as OpenType, h: 400 }, { open: 'door-right' as OpenType }] }] } }
);
