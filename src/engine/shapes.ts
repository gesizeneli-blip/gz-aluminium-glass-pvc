import type { ShapeDef } from '../types';

export interface Pt {
  x: number;
  y: number;
}
export interface Seg {
  label: string;
  len: number;
  curved: boolean;
}

export const isShaped = (s?: ShapeDef): s is ShapeDef => !!s && s.type !== 'rect';
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** Fills in defaults and clamps parameters to valid ranges. */
export function normalizeShape(W: number, H: number, s: ShapeDef): { def: ShapeDef; warnings: string[] } {
  const warnings: string[] = [];
  const d: ShapeDef = { ...s };
  if (s.type === 'arch') {
    const max = Math.max(60, Math.min(W / 2, H - 100));
    const r = s.rise && s.rise > 0 ? s.rise : max;
    d.rise = clamp(r, 50, max);
    if (d.rise !== r) warnings.push(`Lartësia e harkut u rregullua në ${Math.round(d.rise)} mm (kufijtë: 50 deri ${Math.round(max)} mm).`);
  } else if (s.type === 'trapezoid') {
    const lo = s.lowH && s.lowH > 0 ? s.lowH : H / 2;
    d.lowH = clamp(lo, 100, Math.max(101, H - 50));
    d.lowSide = s.lowSide ?? 'right';
    if (d.lowH !== lo) warnings.push(`Lartësia e anës së ulët u rregullua në ${Math.round(d.lowH)} mm.`);
  } else if (s.type === 'triangle') {
    d.apex = clamp(s.apex ?? 50, 0, 100);
  }
  return { def: d, warnings };
}

/** Outline in mm, origin top-left, y down. */
export function outline(W: number, H: number, s: ShapeDef, steps = 48): Pt[] {
  const { def } = normalizeShape(W, H, s);
  switch (def.type) {
    case 'arch': {
      const r = def.rise!;
      const R = (W * W / 4 + r * r) / (2 * r);
      const phi = Math.asin(Math.min(1, W / 2 / R));
      const pts: Pt[] = [{ x: 0, y: H }, { x: 0, y: r }];
      for (let k = 1; k < steps; k++) {
        const a = -Math.PI / 2 - phi + (2 * phi * k) / steps;
        pts.push({ x: W / 2 + R * Math.cos(a), y: R + R * Math.sin(a) });
      }
      pts.push({ x: W, y: r }, { x: W, y: H });
      return pts;
    }
    case 'trapezoid': {
      const lo = def.lowH!;
      return def.lowSide === 'left'
        ? [{ x: 0, y: H }, { x: 0, y: H - lo }, { x: W, y: 0 }, { x: W, y: H }]
        : [{ x: 0, y: H }, { x: 0, y: 0 }, { x: W, y: H - lo }, { x: W, y: H }];
    }
    case 'triangle': {
      const a = (W * (def.apex ?? 50)) / 100;
      return [{ x: 0, y: H }, { x: a, y: 0 }, { x: W, y: H }];
    }
    case 'oval': {
      const pts: Pt[] = [];
      const n = steps * 2;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
        pts.push({ x: W / 2 + (W / 2) * Math.cos(a), y: H / 2 + (H / 2) * Math.sin(a) });
      }
      return pts;
    }
    default:
      return [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Real frame segments (mm, outer length). Curved ones are bent profiles. */
export function segments(W: number, H: number, s: ShapeDef): Seg[] {
  const { def } = normalizeShape(W, H, s);
  const L = (label: string, len: number, curved = false): Seg => ({ label, len, curved });
  switch (def.type) {
    case 'arch': {
      const r = def.rise!;
      const R = (W * W / 4 + r * r) / (2 * r);
      const phi = Math.asin(Math.min(1, W / 2 / R));
      return [L('baza', W), L('ana majtas', H - r), L('hark (profil i harkuar)', 2 * R * phi, true), L('ana djathtas', H - r)];
    }
    case 'trapezoid': {
      const lo = def.lowH!;
      const slope = Math.hypot(W, H - lo);
      const left = def.lowSide === 'left' ? lo : H;
      const right = def.lowSide === 'left' ? H : lo;
      return [L('baza', W), L('ana majtas', left), L('ana e pjerrët', slope), L('ana djathtas', right)];
    }
    case 'triangle': {
      const a = (W * (def.apex ?? 50)) / 100;
      return [L('baza', W), L('ana majtas', Math.hypot(a, H)), L('ana djathtas', Math.hypot(W - a, H))];
    }
    case 'oval': {
      const a = W / 2, b = H / 2;
      const P = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      return [1, 2, 3, 4].map((i) => L(`harku ${i}/4 (i harkuar)`, P / 4, true));
    }
    default: {
      const pts = outline(W, H, def);
      return pts.map((p, i) => L(`ana ${i + 1}`, dist(p, pts[(i + 1) % pts.length])));
    }
  }
}

export const shapePerimeter = (W: number, H: number, s: ShapeDef) => segments(W, H, s).reduce((a, x) => a + x.len, 0);

function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function inside(pts: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Inward offset of a convex polygon (miter joins). */
export function insetPolygon(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  // decide which side is "inside" using edge 0
  const e0x = pts[1].x - pts[0].x, e0y = pts[1].y - pts[0].y;
  const l0 = Math.hypot(e0x, e0y) || 1;
  const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
  const sgn = inside(pts, mx + (-e0y / l0) * 0.01, my + (e0x / l0) * 0.01) ? 1 : -1;
  const normal = (a: Pt, b: Pt) => {
    const ex = b.x - a.x, ey = b.y - a.y;
    const l = Math.hypot(ex, ey) || 1;
    return { x: (sgn * -ey) / l, y: (sgn * ex) / l };
  };
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const n1 = normal(prev, cur), n2 = normal(cur, next);
    const dot = n1.x * n2.x + n1.y * n2.y;
    const k = 1 + dot;
    if (k < 0.05) out.push({ x: cur.x + n1.x * d, y: cur.y + n1.y * d });
    else out.push({ x: cur.x + ((n1.x + n2.x) * d) / k, y: cur.y + ((n1.y + n2.y) * d) / k });
  }
  return Math.abs(area(out)) < Math.abs(area(pts)) ? out : pts;
}
