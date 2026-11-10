import type { Layout, OpenType, ShapeDef, ShutterDef } from '../types';
import { computeGeometry, isSash } from './geometry';
import { insetPolygon, isShaped, normalizeShape, outline, segments } from './shapes';

export type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number }
  | { k: 'poly'; pts: [number, number][]; fill?: string; stroke?: string; sw?: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke?: string; sw?: number; dash?: number[] }
  | { k: 'text'; x: number; y: number; s: string; size: number; anchor?: 'start' | 'middle' | 'end'; rot?: number; fill?: string; bold?: boolean };

export interface Drawing {
  shapes: Shape[];
  vb: { x: number; y: number; w: number; h: number };
}

export interface DrawOpts {
  dims?: boolean;
  glassLabels?: Record<string, string>; // cell key -> "350x1230"
  colorHex?: string;
  showKeys?: boolean;
  shape?: ShapeDef;
  shutter?: ShutterDef;
  nets?: Record<string, boolean>;
}

const INK = '#1b2433';

function buildShapedDrawing(W: number, H: number, shape: ShapeDef, params: Record<string, number>, opts: DrawOpts): Drawing {
  const fw = params.frameW ?? 60;
  const big = Math.max(W, H);
  const u = big / 600;
  const fs = big / 42;
  const shapes: Shape[] = [];
  const out = outline(W, H, shape);
  const inn = insetPolygon(out, fw);
  const P = (pts: { x: number; y: number }[]): [number, number][] => pts.map((p) => [p.x, p.y]);
  shapes.push({ k: 'poly', pts: P(out), fill: opts.colorHex || '#e9ecef', stroke: INK, sw: u * 1.6 });
  shapes.push({ k: 'poly', pts: P(inn), fill: '#cfe6f5', stroke: INK, sw: u });
  const lab = opts.glassLabels?.['1-1'];
  const cx = inn.reduce((a, p) => a + p.x, 0) / inn.length;
  const cy = inn.reduce((a, p) => a + p.y, 0) / inn.length;
  if (lab) shapes.push({ k: 'text', x: cx, y: cy + fs * 0.3, s: lab, size: fs * 0.62, anchor: 'middle', fill: '#27425f' });
  const dl = (x1: number, y1: number, x2: number, y2: number) => shapes.push({ k: 'line', x1, y1, x2, y2, stroke: '#6b7280', sw: u * 0.7 });
  if (opts.dims !== false) {
    const yb = H + fs * 2.2;
    dl(0, yb, W, yb);
    dl(0, H + fs * 0.4, 0, yb + fs * 0.6);
    dl(W, H + fs * 0.4, W, yb + fs * 0.6);
    shapes.push({ k: 'text', x: W / 2, y: yb + fs * 1.15, s: `${Math.round(W)}`, size: fs, anchor: 'middle', bold: true });
    const xl = -fs * 2.2;
    dl(xl, 0, xl, H);
    dl(-fs * 0.4, 0, xl - fs * 0.6, 0);
    dl(-fs * 0.4, H, xl - fs * 0.6, H);
    shapes.push({ k: 'text', x: xl - fs * 0.5, y: H / 2, s: `${Math.round(H)}`, size: fs, anchor: 'middle', rot: -90, bold: true });
    // extra dimensions for the shape
    const segs = segments(W, H, shape);
    const xr = W + fs * 1.6;
    if (shape.type === 'arch') {
      const rise = normalizeShape(W, H, shape).def.rise ?? 0;
      const side = H - rise;
      dl(xr, H - side, xr, H);
      shapes.push({ k: 'text', x: xr + fs * 0.9, y: H - side / 2, s: `${Math.round(side)}`, size: fs * 0.8, anchor: 'middle', rot: -90 });
      shapes.push({ k: 'text', x: W / 2, y: -fs * 0.8, s: `hark ${Math.round(segs[2].len)}`, size: fs * 0.75, anchor: 'middle', fill: '#6b7280' });
    } else if (shape.type === 'trapezoid') {
      const nd = normalizeShape(W, H, shape).def;
      const lo = Math.round(nd.lowH ?? H / 2);
      const onLeft = nd.lowSide === 'left';
      const xx = onLeft ? xl - fs * 3.2 : xr;
      dl(xx, H - lo, xx, H);
      shapes.push({ k: 'text', x: onLeft ? xx - fs * 0.5 : xx + fs * 0.9, y: H - lo / 2, s: `${lo}`, size: fs * 0.8, anchor: 'middle', rot: -90 });
    } else if (shape.type === 'triangle') {
      const a = (W * (normalizeShape(W, H, shape).def.apex ?? 50)) / 100;
      const yt = -fs * 1.6;
      dl(0, yt, a, yt);
      shapes.push({ k: 'text', x: a / 2, y: yt - fs * 0.35, s: `${Math.round(a)}`, size: fs * 0.8, anchor: 'middle' });
    }
  }
  const padL = opts.dims === false ? fs : fs * 6.5;
  const padT = opts.dims === false ? fs : fs * 3.2;
  const padR = opts.dims === false ? fs : fs * 4;
  const padB = opts.dims === false ? fs : fs * 4.6;
  return { shapes, vb: { x: -padL, y: -padT, w: W + padL + padR, h: H + padT + padB } };
}

export function buildDrawing(W: number, H: number, layout: Layout, params: Record<string, number>, opts: DrawOpts = {}): Drawing {
  const d = buildWindowDrawing(W, H, layout, params, opts);
  const sh = opts.shutter;
  if (!sh?.enabled || !(sh.boxH > 0)) return d;
  return addShutterBox(d, W, H, sh, opts);
}

/** Roller shutter box on top of the window: window shapes move down, the box is drawn above (top dimensions stay on top). */
function addShutterBox(d: Drawing, W: number, H: number, sh: ShutterDef, opts: DrawOpts): Drawing {
  const bh = sh.boxH;
  const big = Math.max(W, H + bh);
  const u = big / 600;
  const fs = big / 42;
  const dy = (y: number) => (y >= -1e-6 ? y + bh : y);
  const above = (s: Shape) => {
    if (s.k === 'rect') return s.y + s.h < -1e-6;
    if (s.k === 'poly') return s.pts.every((p) => p[1] < -1e-6);
    if (s.k === 'line') return s.y1 < -1e-6 && s.y2 < -1e-6;
    return s.y < -1e-6;
  };
  const moved: Shape[] = d.shapes.map((s) => {
    if (above(s)) return s;
    if (s.k === 'rect') return { ...s, y: s.y + bh };
    if (s.k === 'poly') return { ...s, pts: s.pts.map((p) => [p[0], p[1] + bh] as [number, number]) };
    if (s.k === 'line') return { ...s, y1: dy(s.y1), y2: dy(s.y2) };
    return { ...s, y: s.y + bh };
  });
  const frame = opts.colorHex || '#e9ecef';
  const out: Shape[] = [];
  // box
  out.push({ k: 'rect', x: 0, y: 0, w: W, h: bh, fill: frame, stroke: INK, sw: u * 1.6 });
  // slats seen through the inspection panel
  const slatH = Math.max(bh / 8, 6);
  for (let y = slatH; y < bh - slatH * 0.4; y += slatH) out.push({ k: 'line', x1: bh * 0.15, y1: y, x2: W - bh * 0.15, y2: y, stroke: '#9aa4b2', sw: u * 0.5 });
  out.push({ k: 'rect', x: bh * 0.15, y: slatH * 0.5, w: W - bh * 0.3, h: bh - slatH, fill: 'none', stroke: INK, sw: u * 0.6 });
  if (sh.motor) {
    // motor symbol (circle with M) at the right end of the box
    const r = Math.min(bh * 0.32, fs * 1.6);
    const cx = W - bh * 0.15 - r * 1.4;
    const cy = bh / 2;
    const pts: [number, number][] = Array.from({ length: 20 }, (_, i) => [cx + r * Math.cos((i / 20) * Math.PI * 2), cy + r * Math.sin((i / 20) * Math.PI * 2)]);
    out.push({ k: 'poly', pts, fill: '#fff', stroke: '#b4232a', sw: u * 0.9 });
    out.push({ k: 'text', x: cx, y: cy + r * 0.38, s: 'M', size: r * 1.1, anchor: 'middle', fill: '#b4232a', bold: true });
  }
  out.push({ k: 'text', x: bh * 0.3, y: bh / 2 + fs * 0.3, s: 'Kuti roletë', size: Math.min(fs * 0.75, bh * 0.28), anchor: 'start', fill: '#444' });
  // guide rails along both sides of the window
  const rail = Math.max(18, W / 60);
  out.push({ k: 'rect', x: 0, y: bh, w: rail * 0.6, h: H, fill: 'none', stroke: '#9aa4b2', sw: u * 0.6 });
  out.push({ k: 'rect', x: W - rail * 0.6, y: bh, w: rail * 0.6, h: H, fill: 'none', stroke: '#9aa4b2', sw: u * 0.6 });
  if (opts.dims !== false) {
    const xl = -fs * 4.8;
    out.push({ k: 'line', x1: xl, y1: 0, x2: xl, y2: bh, stroke: '#6b7280', sw: u * 0.7 });
    out.push({ k: 'line', x1: -fs * 0.4, y1: 0, x2: xl - fs * 0.6, y2: 0, stroke: '#6b7280', sw: u * 0.7 });
    out.push({ k: 'line', x1: -fs * 0.4, y1: bh, x2: xl - fs * 0.6, y2: bh, stroke: '#6b7280', sw: u * 0.7 });
    out.push({ k: 'text', x: xl - fs * 0.5, y: bh / 2, s: `${Math.round(bh)}`, size: fs * 0.8, anchor: 'middle', rot: -90 });
  }
  const vb = d.vb;
  const extra = opts.dims === false ? 0 : fs * 3;
  return { shapes: [...moved, ...out], vb: { x: vb.x - extra, y: vb.y, w: vb.w + extra, h: vb.h + bh } };
}

function addNets(shapes: Shape[], cells: { key: string; x: number; y: number; cw: number; ch: number }[], nets: Record<string, boolean> | undefined, u: number) {
  if (!nets) return;
  for (const c of cells) {
    if (!nets[c.key]) continue;
    const step = Math.max(14, Math.min(c.cw, c.ch) / 14);
    const x0 = c.x + 4, y0 = c.y + 4, x1 = c.x + c.cw - 4, y1 = c.y + c.ch - 4;
    for (let x = x0 + step; x < x1; x += step) shapes.push({ k: 'line', x1: x, y1: y0, x2: x, y2: y1, stroke: '#7b8794', sw: u * 0.25 });
    for (let y = y0 + step; y < y1; y += step) shapes.push({ k: 'line', x1: x0, y1: y, x2: x1, y2: y, stroke: '#7b8794', sw: u * 0.25 });
  }
}

function buildWindowDrawing(W: number, H: number, layout: Layout, params: Record<string, number>, opts: DrawOpts = {}): Drawing {
  if (isShaped(opts.shape)) return buildShapedDrawing(W, H, opts.shape, params, opts);
  const g = computeGeometry(W, H, layout, params);
  const fw = params.frameW ?? 60;
  const sw = params.sashW ?? 70;
  const big = Math.max(W, H);
  const u = big / 600; // base stroke unit
  const fs = big / 42; // font size
  const shapes: Shape[] = [];
  const frameFill = opts.colorHex || '#e9ecef';
  const glassFill = '#cfe6f5';

  shapes.push({ k: 'rect', x: 0, y: 0, w: W, h: H, fill: frameFill, stroke: INK, sw: u * 1.6 });
  shapes.push({ k: 'rect', x: fw, y: fw, w: W - 2 * fw, h: H - 2 * fw, fill: '#fff', stroke: INK, sw: u });

  const mw = params.mullionW ?? 0;
  for (const m of g.mullV) shapes.push({ k: 'rect', x: m.x, y: m.y, w: mw, h: m.len, fill: frameFill, stroke: INK, sw: u });
  for (const m of g.mullH) shapes.push({ k: 'rect', x: m.x, y: m.y, w: m.len, h: mw, fill: frameFill, stroke: INK, sw: u });

  for (const c of g.cells) {
    const sash = isSash(c.open);
    const slide = c.open.startsWith('slide');
    if (sash) {
      shapes.push({ k: 'rect', x: c.x, y: c.y, w: c.cw, h: c.ch, fill: frameFill, stroke: INK, sw: u * 1.2 });
      const s = Math.min(sw, c.cw / 3, c.ch / 3);
      shapes.push({ k: 'rect', x: c.x + s, y: c.y + s, w: c.cw - 2 * s, h: c.ch - 2 * s, fill: glassFill, stroke: INK, sw: u });
      openingSymbol(shapes, c.open, c.x + s, c.y + s, c.cw - 2 * s, c.ch - 2 * s, u, fs);
      if (slide) {
        // overlay offset hint
      }
    } else {
      const b = Math.min(12, c.cw / 6, c.ch / 6);
      shapes.push({ k: 'rect', x: c.x, y: c.y, w: c.cw, h: c.ch, fill: '#fff', stroke: INK, sw: u });
      shapes.push({ k: 'rect', x: c.x + b, y: c.y + b, w: c.cw - 2 * b, h: c.ch - 2 * b, fill: glassFill, stroke: INK, sw: u * 0.8 });
    }
    const lab = opts.glassLabels?.[c.key];
    const cx = c.x + c.cw / 2;
    const cy = c.y + c.ch / 2;
    if (lab) {
      shapes.push({ k: 'text', x: cx, y: cy + fs * 0.35, s: lab, size: fs * 0.62, anchor: 'middle', fill: '#27425f' });
    }
    if (opts.showKeys) {
      shapes.push({ k: 'text', x: c.x + fs * 0.4, y: c.y + fs * 1.1, s: c.key, size: fs * 0.6, fill: '#a33' });
    }
  }

  addNets(shapes, g.cells, opts.nets, u);
  const mg = opts.dims === false ? 0 : fs * 4.2;
  if (opts.dims !== false) {
    const dimLine = (x1: number, y1: number, x2: number, y2: number) => {
      shapes.push({ k: 'line', x1, y1, x2, y2, stroke: '#6b7280', sw: u * 0.7 });
    };
    // overall width (bottom)
    const yb = H + fs * 2.2;
    dimLine(0, yb, W, yb);
    dimLine(0, H + fs * 0.4, 0, yb + fs * 0.6);
    dimLine(W, H + fs * 0.4, W, yb + fs * 0.6);
    shapes.push({ k: 'text', x: W / 2, y: yb + fs * 1.15, s: `${Math.round(W)}`, size: fs, anchor: 'middle', bold: true });
    // overall height (left)
    const xl = -fs * 2.2;
    dimLine(xl, 0, xl, H);
    dimLine(-fs * 0.4, 0, xl - fs * 0.6, 0);
    dimLine(-fs * 0.4, H, xl - fs * 0.6, H);
    shapes.push({ k: 'text', x: xl - fs * 0.5, y: H / 2, s: `${Math.round(H)}`, size: fs, anchor: 'middle', rot: -90, bold: true });
    // aperture widths of columns (top) when more than one column
    const firstRowCells = g.cells.filter((c) => c.row === 1);
    if (firstRowCells.length > 1) {
      const yt = -fs * 1.6;
      for (const c of firstRowCells) {
        dimLine(c.x, yt, c.x + c.cw, yt);
        shapes.push({ k: 'text', x: c.x + c.cw / 2, y: yt - fs * 0.35, s: `${Math.round(c.cw)}`, size: fs * 0.8, anchor: 'middle' });
      }
    }
    // aperture heights of last column (right) when more than one row
    const lastCol = Math.max(...g.cells.map((c) => c.col));
    const lastCells = g.cells.filter((c) => c.col === lastCol);
    if (lastCells.length > 1) {
      const xr = W + fs * 1.6;
      for (const c of lastCells) {
        dimLine(xr, c.y, xr, c.y + c.ch);
        shapes.push({ k: 'text', x: xr + fs * 0.9, y: c.y + c.ch / 2, s: `${Math.round(c.ch)}`, size: fs * 0.8, anchor: 'middle', rot: -90 });
      }
    }
  }
  const padL = opts.dims === false ? fs : fs * 4;
  const padT = opts.dims === false ? fs : fs * 3.2;
  const padR = opts.dims === false ? fs : fs * 4;
  const padB = opts.dims === false ? fs : fs * 4.6;
  void mg;
  return { shapes, vb: { x: -padL, y: -padT, w: W + padL + padR, h: H + padT + padB } };
}

function openingSymbol(shapes: Shape[], open: OpenType, x: number, y: number, w: number, h: number, u: number, fs: number) {
  const dash = [u * 6, u * 4];
  const stroke = '#b4232a';
  const L = (x1: number, y1: number, x2: number, y2: number, d?: number[]) =>
    shapes.push({ k: 'line', x1, y1, x2, y2, stroke, sw: u * 0.9, dash: d });
  const turnLeft = open.endsWith('left') && (open.startsWith('turn') || open.startsWith('tilt-turn') || open.startsWith('door'));
  const turnRight = open.endsWith('right') && (open.startsWith('turn') || open.startsWith('tilt-turn') || open.startsWith('door'));
  if (turnLeft) { L(x, y + h / 2, x + w, y); L(x, y + h / 2, x + w, y + h); }
  if (turnRight) { L(x + w, y + h / 2, x, y); L(x + w, y + h / 2, x, y + h); }
  if (open === 'tilt' || open.startsWith('tilt-turn')) {
    L(x, y, x + w / 2, y + h, dash);
    L(x + w, y, x + w / 2, y + h, dash);
  }
  const hx = turnLeft ? x + w - fs * 0.9 : x + fs * 0.9;
  if (open.startsWith('fold')) {
    // zig-zag fold symbol + arrow
    const dir = open === 'fold-right' ? 1 : -1;
    const x0 = dir > 0 ? x : x + w;
    const seg = w / 4;
    for (let i = 0; i < 4; i++) {
      const xa = x0 + dir * seg * i;
      const xb = x0 + dir * seg * (i + 1);
      L(xa, i % 2 === 0 ? y + h * 0.3 : y + h * 0.7, xb, i % 2 === 0 ? y + h * 0.7 : y + h * 0.3);
    }
    return;
  }
  if (open !== 'tilt' && !open.startsWith('slide')) {
    shapes.push({ k: 'rect', x: hx - fs * 0.2, y: y + h / 2 - fs * 0.9, w: fs * 0.4, h: fs * 1.8, fill: '#444', stroke: '#222', sw: u * 0.5 });
  }
  if (open.startsWith('slide')) {
    const dir = open === 'slide-right' ? 1 : -1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const len = Math.min(w * 0.3, fs * 6);
    L(cx - dir * len, cy, cx + dir * len, cy);
    L(cx + dir * len, cy, cx + dir * (len - fs), cy - fs * 0.6);
    L(cx + dir * len, cy, cx + dir * (len - fs), cy + fs * 0.6);
    shapes.push({ k: 'rect', x: dir > 0 ? x + w - fs * 1.4 : x + fs, y: y + h / 2 - fs * 0.9, w: fs * 0.4, h: fs * 1.8, fill: '#444', stroke: '#222', sw: u * 0.5 });
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function drawingToSvg(d: Drawing): string {
  const parts = d.shapes.map((s) => {
    if (s.k === 'rect')
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill ?? 'none'}" stroke="${s.stroke ?? 'none'}" stroke-width="${s.sw ?? 1}"/>`;
    if (s.k === 'poly')
      return `<polygon points="${s.pts.map((p) => p.join(',')).join(' ')}" fill="${s.fill ?? 'none'}" stroke="${s.stroke ?? 'none'}" stroke-width="${s.sw ?? 1}" stroke-linejoin="round"/>`;
    if (s.k === 'line')
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke ?? INK}" stroke-width="${s.sw ?? 1}"${s.dash ? ` stroke-dasharray="${s.dash.join(' ')}"` : ''}/>`;
    const rot = s.rot ? ` transform="rotate(${s.rot} ${s.x} ${s.y})"` : '';
    return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" font-family="Helvetica, Arial, sans-serif" text-anchor="${s.anchor ?? 'start'}" fill="${s.fill ?? INK}"${s.bold ? ' font-weight="700"' : ''}${rot}>${esc(s.s)}</text>`;
  });
  const { x, y, w, h } = d.vb;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
