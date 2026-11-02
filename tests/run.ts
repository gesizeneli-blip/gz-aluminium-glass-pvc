import assert from 'node:assert/strict';
import { evaluate } from '../src/engine/formula';
import { optimizeCuts } from '../src/engine/optimizer';
import { calcWindow, CalcCtx, DEFAULT_CATEGORIES, sumCalcs } from '../src/engine/calc';
import { computeGeometry, PRESETS } from '../src/engine/geometry';
import { buildSystemsAndProfiles, ACCESSORIES, GLASS_TYPES, LABOR_RATES } from '../src/db/seed';
import type { WindowItem } from '../src/types';
import { insetPolygon, outline, segments, shapePerimeter } from '../src/engine/shapes';
import { buildDrawing, drawingToSvg } from '../src/engine/drawing';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

t('formula basics', () => {
  assert.equal(evaluate('W - 2*frameW', { W: 1200, frameW: 60 }), 1080);
  assert.equal(evaluate('if(SH>1400,3,2)', { SH: 1500 }), 3);
  assert.equal(evaluate('max(1,2)+min(5,3)*(2+1)', {}), 11);
  assert.throws(() => evaluate('W + nope', { W: 1 }));
  assert.throws(() => evaluate('1/0', {}));
  assert.throws(() => evaluate('process.exit()', {}));
});

t('cutting: user example 6500 bar', () => {
  const r = optimizeCuts([1800, 1800, 1500, 1200, 900].map((length) => ({ length })), 6500, 3, 0);
  assert.equal(r.bars.length, 2);
  assert.equal(r.oversize.length, 0);
  assert.equal(r.totalNet, 7200);
  for (const b of r.bars) assert.ok(b.used <= 6500);
});

t('cutting: improves over naive and respects capacity', () => {
  const lens = [3000, 2900, 2800, 2200, 2100, 1900, 1700, 1500, 1300, 1000, 800, 600, 400];
  const r = optimizeCuts(lens.map((length) => ({ length })), 6500, 4, 2);
  assert.ok(r.bars.length >= r.lowerBound);
  for (const b of r.bars) assert.ok(b.used <= 6500 + 1e-9);
  assert.equal(r.bars.flatMap((b) => b.pieces).length, lens.length);
});

t('cutting: oversize piece reported', () => {
  const r = optimizeCuts([{ length: 7000 }, { length: 1000 }], 6500, 3, 0);
  assert.equal(r.oversize.length, 1);
  assert.equal(r.bars.length, 1);
});

const { systems, profiles } = buildSystemsAndProfiles();
const ctx = (): CalcCtx => ({
  systems: new Map(systems.map((s) => [s.id, s])),
  profiles: new Map(profiles.map((p) => [p.id, p])),
  glass: new Map(GLASS_TYPES.map((g) => [g.id, g])),
  acc: new Map(ACCESSORIES.map((a) => [a.id, a])),
  labor: LABOR_RATES,
  categories: DEFAULT_CATEGORIES
});

const win = (over: Partial<WindowItem> = {}): WindowItem => ({
  projectId: 1, name: 'D1', kind: 'x', width: 1200, height: 1500, qty: 1, systemId: 'trocal70', glassId: 'g-double',
  cellGlass: {}, color: 'E bardhë',
  layout: PRESETS.find((p) => p.key === 'double-turn')!.layout,
  pricing: { method: 'm2', unitPrice: 10000, manualTotal: 0, marginPct: 20 },
  laborIds: [], extras: [], lineOff: {}, extraPieces: [], accQty: {}, notes: '', order: 0, ...over
});

t('geometry double sash', () => {
  const s = systems[0];
  const g = computeGeometry(1200, 1500, win().layout, s.params);
  assert.equal(g.cells.length, 2);
  assert.equal(g.cells[0].cw, 500); // (1200-120-80)/2
  assert.equal(g.cells[0].ch, 1380);
  assert.equal(g.mullV.length, 1);
});

t('profile pieces + glass from real deductions (not outer size)', () => {
  const c = calcWindow(win(), ctx());
  assert.deepEqual(c.errors, []);
  const frame = c.pieces.filter((p) => p.profileId === 'trocal70-frame');
  const total = frame.reduce((s, p) => s + p.length * p.qty, 0);
  assert.equal(total, 2 * 1200 + 2 * 1500);
  // sash glass = SW - 2*sashW = 500-150 = 350 ; SH-150 = 1230
  assert.equal(c.glass[0].w, 350);
  assert.equal(c.glass[0].h, 1230);
  assert.notEqual(c.glass[0].w, 1200);
  assert.equal(c.glass.length, 2);
  assert.ok(c.accessories.length > 0);
});

t('costs, price, profit; purchase separate from selling', () => {
  const cx = ctx();
  cx.profiles.get('trocal70-frame')!.purchasePerM = 10;
  cx.profiles.get('trocal70-frame')!.sellPerM = 15;
  cx.glass.get('g-double')!.purchasePerM2 = 2000;
  cx.glass.get('g-double')!.sellPerM2 = 3000;
  const c = calcWindow(win({ qty: 2 }), cx);
  const frameMeters = 5.4 * 2; // qty 2
  assert.ok(Math.abs(c.costs.profiles - frameMeters * 10) < 1e-6);
  const glassArea = 2 * (0.35 * 1.23) * 2;
  assert.ok(Math.abs(c.costs.glass - glassArea * 2000) < 1e-6);
  assert.ok(Math.abs(c.price - 10000 * 1.8 * 2) < 1e-6);
  assert.ok(Math.abs(c.profit - (c.price - c.costs.total)) < 1e-9);
  assert.ok(c.materialSell > c.costs.material);
  const s = sumCalcs([c]);
  assert.equal(s.windows, 2);
});

t('pricing methods', () => {
  const cx = ctx();
  const base = win();
  assert.equal(calcWindow({ ...base, pricing: { ...base.pricing, method: 'unit', unitPrice: 5000 }, qty: 3 }, cx).price, 15000);
  assert.equal(calcWindow({ ...base, pricing: { ...base.pricing, method: 'manual', manualTotal: 777 } }, cx).price, 777);
  assert.ok(Math.abs(calcWindow({ ...base, pricing: { ...base.pricing, method: 'ml', unitPrice: 100 } }, cx).price - 100 * 5.4) < 1e-6);
});

t('manual adjustments: disable line + extra piece', () => {
  const cx = ctx();
  const c = calcWindow(win({ lineOff: { 'f-h': true }, extraPieces: [{ profileId: 'trocal70-frame', length: 500, qty: 1, label: 'x' }] }), cx);
  const frame = c.pieces.filter((p) => p.profileId === 'trocal70-frame');
  assert.equal(frame.reduce((s, p) => s + p.length * p.qty, 0), 2 * 1500 + 500);
  const c2 = calcWindow(win({ accQty: { handle: 5 } }), cx);
  assert.equal(c2.accessories.find((a) => a.accessoryId === 'handle')!.qty, 5);
});

t('systems have independent recipes', () => {
  systems[0].recipe[0].lengthFormula = 'W + 99';
  assert.notEqual(systems[1].recipe[0].lengthFormula, systems[0].recipe[0].lengthFormula);
  systems[0].recipe[0].lengthFormula = 'W + weldAllow';
});

t('bad formula reported, not thrown', () => {
  const cx = ctx();
  const s = { ...cx.systems.get('trocal70')!, recipe: [{ ...cx.systems.get('trocal70')!.recipe[0], lengthFormula: 'W + zzz' }] };
  cx.systems.set('trocal70', s);
  const c = calcWindow(win(), cx);
  assert.ok(c.errors.length > 0);
});

t('all presets compute on all systems', () => {
  for (const s of systems) for (const p of PRESETS) {
    const c = calcWindow(win({ systemId: s.id, layout: p.layout, width: 1800, height: 2100 }), ctx());
    assert.deepEqual(c.errors, [], `${s.id}/${p.key}`);
  }
});

t('shapes: arch semicircle, trapezoid, triangle, oval segments', () => {
  const arch = segments(1000, 1500, { type: 'arch', rise: 500 });
  assert.ok(Math.abs(arch[2].len - Math.PI * 500) < 0.5, 'semicircle arc = pi*r');
  assert.equal(arch[1].len, 1000);
  assert.ok(arch[2].curved);
  const trap = segments(1000, 1500, { type: 'trapezoid', lowH: 900, lowSide: 'right' });
  assert.ok(Math.abs(trap[2].len - Math.hypot(1000, 600)) < 1e-6);
  const tri = segments(1200, 1000, { type: 'triangle', apex: 50 });
  assert.ok(Math.abs(tri[1].len - Math.hypot(600, 1000)) < 1e-6);
  const ov = shapePerimeter(1000, 1000, { type: 'oval' });
  assert.ok(Math.abs(ov - Math.PI * 1000) < 1, 'circle perimeter');
});

t('shapes: inset polygon is smaller, finite, inside', () => {
  for (const sh of [{ type: 'arch' as const, rise: 400 }, { type: 'trapezoid' as const, lowH: 700, lowSide: 'left' as const }, { type: 'triangle' as const, apex: 30 }, { type: 'oval' as const }]) {
    const o = outline(1200, 1600, sh);
    const i = insetPolygon(o, 60);
    assert.equal(i.length, o.length);
    for (const p of i) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); assert.ok(p.x >= 0 && p.x <= 1200 && p.y >= 0 && p.y <= 1600, sh.type); }
    const svg = drawingToSvg(buildDrawing(1200, 1600, [] as any, systems[0].params, { shape: sh, glassLabels: { '1-1': '1x1' } } as any));
    assert.ok(svg.includes('<polygon'));
  }
});

t('shaped window: frame by segments, bounding-rect glass and price', () => {
  const cx = ctx();
  const w = win({ shape: { type: 'arch', rise: 500 }, width: 1000, height: 1500, layout: PRESETS[0].layout });
  const c = calcWindow(w, cx);
  assert.deepEqual(c.errors, []);
  const frame = c.pieces.filter((p) => p.profileId === 'trocal70-frame');
  assert.equal(frame.reduce((a, p) => a + p.qty, 0), 4);
  assert.ok(frame.some((p) => Math.abs(p.length - Math.PI * 500) < 1));
  assert.equal(c.glass.length, 1);
  assert.equal(c.glass[0].w, 1000 - 2 * 60);
  assert.ok(Math.abs(c.price - 10000 * 1.5) < 1e-6, 'm2 price from bounding rectangle');
  assert.ok(c.warnings.some((x) => x.includes('jo-drejtkëndëshe')));
  assert.ok(c.meters.length > 0, 'gasket by perimeter');
  for (const type of ['trapezoid', 'triangle', 'oval'] as const) {
    const cc = calcWindow(win({ shape: { type }, width: 1200, height: 1400 }), cx);
    assert.deepEqual(cc.errors, [], type);
    assert.ok(cc.pieces.length >= 3, type);
  }
});

console.log(`\n${n} test groups passed`);
