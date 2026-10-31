/**
 * Cutting-stock optimizer (1D) for profile bars.
 * Each piece consumes (length + cutAllowance + kerf) of a bar (conservative: every
 * piece is followed by one saw cut). Pieces of different profiles are never mixed
 * because the caller optimizes one profile at a time.
 *
 * Strategy: First Fit Decreasing + Best Fit Decreasing, then randomized
 * restarts (perturbed ordering) and a local "empty the emptiest bar" improvement.
 * Result minimizes bar count, then maximizes the largest single remnant.
 */
export interface CutPiece {
  length: number; // mm (net)
  tag?: string; // e.g. window name
}
export interface CutBar {
  pieces: CutPiece[];
  used: number; // mm consumed (incl. kerf + allowance)
  waste: number; // mm left
}
export interface CutResult {
  barLength: number;
  bars: CutBar[];
  oversize: CutPiece[];
  totalNet: number; // sum of net piece lengths
  totalUsed: number;
  totalWaste: number;
  wastePct: number;
  lowerBound: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Item {
  p: CutPiece;
  cost: number;
}

function pack(items: Item[], cap: number, mode: 'ffd' | 'bfd'): Item[][] {
  const bars: Item[][] = [];
  const loads: number[] = [];
  for (const it of items) {
    let idx = -1;
    if (mode === 'ffd') {
      idx = loads.findIndex((l) => l + it.cost <= cap + 1e-9);
    } else {
      let best = Infinity;
      loads.forEach((l, i) => {
        const left = cap - l - it.cost;
        if (left >= -1e-9 && left < best) {
          best = left;
          idx = i;
        }
      });
    }
    if (idx === -1) {
      bars.push([it]);
      loads.push(it.cost);
    } else {
      bars[idx].push(it);
      loads[idx] += it.cost;
    }
  }
  return bars;
}

function score(bars: Item[][], cap: number): number {
  // fewer bars first; then maximize sum of squared loads (concentrates waste in one bar)
  let sq = 0;
  for (const b of bars) {
    const l = b.reduce((s, i) => s + i.cost, 0);
    sq += (l / cap) * (l / cap);
  }
  return bars.length * 1000 - sq;
}

function improve(bars: Item[][], cap: number): Item[][] {
  let cur = bars.map((b) => [...b]);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    const loads = cur.map((b) => b.reduce((s, i) => s + i.cost, 0));
    // try to empty the emptiest bar
    const order = loads.map((l, i) => [l, i] as const).sort((a, b) => a[0] - b[0]);
    for (const [, bi] of order) {
      const victim = cur[bi];
      const trial = cur.filter((_, i) => i !== bi).map((b) => [...b]);
      const tl = trial.map((b) => b.reduce((s, i) => s + i.cost, 0));
      let ok = true;
      for (const it of [...victim].sort((a, b) => b.cost - a.cost)) {
        let best = -1;
        let bestLeft = Infinity;
        tl.forEach((l, i) => {
          const left = cap - l - it.cost;
          if (left >= -1e-9 && left < bestLeft) {
            bestLeft = left;
            best = i;
          }
        });
        if (best === -1) {
          ok = false;
          break;
        }
        trial[best].push(it);
        tl[best] += it.cost;
      }
      if (ok) {
        cur = trial;
        changed = true;
        break;
      }
    }
  }
  return cur;
}

export function optimizeCuts(
  pieces: CutPiece[],
  barLength: number,
  kerf: number,
  cutAllowance: number,
  seed = 12345,
  iterations = 400
): CutResult {
  const cap = barLength;
  const oversize: CutPiece[] = [];
  const items: Item[] = [];
  for (const p of pieces) {
    const cost = p.length + cutAllowance + kerf;
    if (cost > cap + 1e-9 || p.length <= 0) oversize.push(p);
    else items.push({ p, cost });
  }
  const sorted = [...items].sort((a, b) => b.cost - a.cost);
  let best = sorted.length ? pack(sorted, cap, 'ffd') : [];
  if (sorted.length) {
    const cand = pack(sorted, cap, 'bfd');
    if (score(cand, cap) < score(best, cap)) best = cand;
    best = improve(best, cap);
    const totalCost = sorted.reduce((s, i) => s + i.cost, 0);
    const lb = Math.ceil(totalCost / cap - 1e-9);
    const rnd = mulberry32(seed);
    for (let k = 0; k < iterations && best.length > lb; k++) {
      const noisy = sorted
        .map((it) => ({ it, key: it.cost * (1 + (rnd() - 0.5) * 0.35) }))
        .sort((a, b) => b.key - a.key)
        .map((x) => x.it);
      let c = pack(noisy, cap, rnd() < 0.5 ? 'ffd' : 'bfd');
      c = improve(c, cap);
      if (score(c, cap) < score(best, cap)) best = c;
    }
  }
  const bars: CutBar[] = best
    .map((b) => {
      const used = b.reduce((s, i) => s + i.cost, 0);
      return {
        pieces: [...b].sort((x, y) => y.p.length - x.p.length).map((i) => i.p),
        used,
        waste: Math.max(0, cap - used)
      };
    })
    .sort((a, b) => b.used - a.used);
  const totalNet = items.reduce((s, i) => s + i.p.length, 0);
  const totalUsed = bars.reduce((s, b) => s + b.used, 0);
  const totalWaste = bars.length * cap - totalUsed;
  const totalCost = items.reduce((s, i) => s + i.cost, 0);
  return {
    barLength: cap,
    bars,
    oversize,
    totalNet,
    totalUsed,
    totalWaste,
    wastePct: bars.length ? (bars.length * cap - totalNet) / (bars.length * cap) * 100 : 0,
    lowerBound: Math.ceil(totalCost / cap - 1e-9)
  };
}
