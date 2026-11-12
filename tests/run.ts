import assert from 'node:assert/strict';
import { evaluate } from '../src/engine/formula';
import { optimizeCuts } from '../src/engine/optimizer';
import { calcWindow, CalcCtx, DEFAULT_CATEGORIES, sumCalcs } from '../src/engine/calc';
import { PANELS } from '../src/data/panels';
import { computeGeometry, PRESETS, presetsFor, buildMulti, suggestSashCount, matchClass } from '../src/engine/geometry';
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
// PVC system first (tests below use its weldAllow param)
systems.sort((a, b) => Number(b.id === 'kom76md') - Number(a.id === 'kom76md'));
const ctx = (): CalcCtx => ({
  systems: new Map(systems.map((s) => [s.id, s])),
  profiles: new Map(profiles.map((p) => [p.id, p])),
  glass: new Map(GLASS_TYPES.map((g) => [g.id, g])),
  acc: new Map(ACCESSORIES.map((a) => [a.id, a])),
  labor: LABOR_RATES,
  categories: DEFAULT_CATEGORIES
});

const win = (over: Partial<WindowItem> = {}): WindowItem => ({
  projectId: 1, name: 'D1', kind: 'x', width: 1200, height: 1500, qty: 1, systemId: 'kom76md', glassId: 'g-double',
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
  const frame = c.pieces.filter((p) => p.profileId === 'kom76md-frame');
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
  cx.profiles.get('kom76md-frame')!.purchasePerM = 10;
  cx.profiles.get('kom76md-frame')!.sellPerM = 15;
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
  const c = calcWindow(win({ lineOff: { 'f-h': true }, extraPieces: [{ profileId: 'kom76md-frame', length: 500, qty: 1, label: 'x' }] }), cx);
  const frame = c.pieces.filter((p) => p.profileId === 'kom76md-frame');
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
  const s = { ...cx.systems.get('kom76md')!, recipe: [{ ...cx.systems.get('kom76md')!.recipe[0], lengthFormula: 'W + zzz' }] };
  cx.systems.set('kom76md', s);
  const c = calcWindow(win(), cx);
  assert.ok(c.errors.length > 0);
});

t('all presets compute on all systems', () => {
  for (const s of systems) for (const p of PRESETS) {
    const c = calcWindow(win({ systemId: s.id, layout: p.layout, width: 1800, height: 2100 }), ctx());
    assert.deepEqual(c.errors, [], `${s.id}/${p.key}`);
  }
});

t('catalogue: required systems exist with groups and modes', () => {
  const ids = ['alu-open', 'alu-slide', 'alumil-s67', 'alumil-s77', 'alumil-s350', 'alumil-s560', 'alumil-s700', 'kom76md', 'kom76ad', 'weiss72ad', 'weiss60ad',
    'door-ext-alu', 'bifold-alu', 'bifold-glass', 'mirror', 'partition-glass', 'glass-door', 'shower-slide', 'shower-door', 'shower-fold', 'shower-fixed'];
  for (const id of ids) {
    const s = systems.find((x) => x.id === id);
    assert.ok(s, id); assert.ok(s!.group && s!.mode, id + ' group/mode');
    assert.equal(s!.verified, false);
  }
  assert.equal(new Set(systems.map((x) => x.id)).size, systems.length);
  for (const pr of profiles) assert.ok(systems.some((x) => x.id === pr.systemId), pr.id);
  const ch = profiles.find((p) => p.id === 'partition-glass-channel')!;
  assert.ok(ch);
  const c = calcWindow(win({ systemId: 'partition-glass', layout: buildMulti('panels', 2), width: 2000, height: 2200, glassId: 'g-tempered10' }), ctx());
  assert.deepEqual(c.errors, []);
  const piece = c.pieces.find((p) => p.profileId === 'partition-glass-channel')!;
  assert.equal(piece.length, 2000, 'bottom channel runs the full width');
  assert.equal(c.glass.length, 2);
});

t('presets by mode and multi-sash builders', () => {
  assert.ok(presetsFor('slide').every((p) => p.layout.columns.every((cl) => cl.cells.every((x) => x.open === 'fixed' || x.open.startsWith('slide')))));
  assert.ok(presetsFor('fold').length >= 3 && presetsFor('fixed').length >= 3 && presetsFor('swing').length >= 10);
  assert.equal(suggestSashCount(2600, 900), 3);
  assert.equal(suggestSashCount(800, 900), 1);
  assert.equal(buildMulti('slide', 3).columns.length, 3);
  const sf = buildMulti('slide-fixed', 1);
  assert.equal(sf.columns[0].cells[0].open, 'fixed');
  assert.ok(sf.columns[1].cells[0].open.startsWith('slide'));
  assert.equal(matchClass('fold-right'), 'fold');
  const f = buildMulti('fold', 4);
  const c = calcWindow(win({ systemId: 'bifold-alu', layout: f, width: 3200, height: 2200 }), ctx());
  assert.deepEqual(c.errors, []);
  assert.equal(c.accessories.find((a) => a.accessoryId === 'fold-hinge')!.qty, 8, '2 hinges x 4 panels');
  const gd = calcWindow(win({ systemId: 'glass-door', layout: buildMulti('panels-door', 1), width: 1000, height: 2100, glassId: 'g-tempered10' }), ctx());
  assert.equal(gd.accessories.find((a) => a.accessoryId === 'glass-handle-320')!.qty, 1);
  assert.equal(gd.accessories.find((a) => a.accessoryId === 'glass-hinge')!.qty, 2);
  const m = calcWindow(win({ systemId: 'mirror', layout: buildMulti('panels', 1), width: 600, height: 800, glassId: 'g-mirror5' }), ctx());
  assert.ok(Math.abs(m.accessories.find((a) => a.accessoryId === 'polish')!.qty - 2.8) < 1e-9);
});

t('cell fill (panel instead of glass) and fashatura', () => {
  const rates = { infill: { costM2: 20, sellM2: 40 }, trim: { costM: 3, sellM: 5 } };
  const layout = buildMulti('slide', 2);
  const w0 = win({ systemId: 'alu-slide', layout, width: 2000, height: 1500 });
  const c0 = calcWindow(w0, { ...ctx(), ...rates });
  assert.equal(c0.glass.length, 2);
  const w1 = { ...w0, fills: { '1-1': {} }, trims: { top: true, bottom: false, left: true, right: true, w: 60 } };
  const c1 = calcWindow(w1, { ...ctx(), ...rates });
  assert.deepEqual(c1.errors, []);
  assert.equal(c1.glass.length, 1, 'filled cell has no glass');
  const inf = c1.addons!.find((a) => a.label.startsWith('Mbushje'))!;
  const g0 = c0.glass.find((g) => g.cell === '1-1')!;
  assert.ok(Math.abs(inf.qty - (g0.w * g0.h) / 1e6) < 1e-3, 'same area as the glass it replaces');
  assert.ok(Math.abs(inf.sell - inf.qty * 40) < 1e-2);
  const tr = c1.addons!.find((a) => a.label.startsWith('Fashatura'))!;
  assert.ok(Math.abs(tr.qty - (2000 + 1500 + 1500) / 1000) < 1e-9, 'top + left + right');
  assert.ok(Math.abs(tr.sell - 25) < 1e-9);
  // drawing: filled cell uses its colour, hit areas carry the cell key
  const params = ctx().systems.get('alu-slide')!.params;
  const d = buildDrawing(2000, 1500, layout, params, { fills: { '1-1': '#334455' }, hit: true, selected: '1-1', trims: w1.trims });
  assert.ok(d.shapes.some((s) => s.k === 'rect' && s.fill === '#334455'));
  const svg = drawingToSvg(d);
  assert.ok(svg.includes('data-cell="1-1"') && svg.includes('data-cell="2-1"'));
  const dn = buildDrawing(2000, 1500, layout, params, {});
  assert.ok(!drawingToSvg(dn).includes('data-cell'), 'no hit areas outside the editor');
});

t('transom: full-width top section above columns', () => {
  const sys = systems.find((x) => x.id === 'alu-open')!;
  const layout = presetsFor('swing').find((p) => p.key === 'transom-2col')!.layout;
  const g = computeGeometry(1345, 2450, layout, sys.params);
  const T = g.cells.find((c) => c.key === 'T')!;
  assert.equal(T.cw, g.innerW); assert.equal(T.ch, 300);
  const bottoms = g.cells.filter((c) => c.key !== 'T');
  assert.equal(bottoms.length, 2);
  const mw = sys.params.mullionW;
  assert.ok(bottoms.every((c) => Math.abs(c.y - (sys.params.frameW + 300 + mw)) < 1e-9));
  assert.ok(Math.abs(bottoms[0].ch - (g.innerH - 300 - mw)) < 1e-9);
  assert.equal(g.mullV.length, 1); assert.equal(g.mullH.length, 1);
  assert.ok(Math.abs(g.mullV[0].y - bottoms[0].y) < 1e-9 && Math.abs(g.mullV[0].len - bottoms[0].ch) < 1e-9, 'vertical mullion starts under the transom');
  const area = g.cells.reduce((a, c) => a + c.cw * c.ch, 0);
  const c = calcWindow(win({ systemId: 'alu-open', layout, width: 1345, height: 2450 }), ctx());
  assert.deepEqual(c.errors, []);
  assert.equal(c.glass.length, 3);
  assert.ok(area > 0);
});

t('exterior door with catalogue panel', () => {
  const sys = systems.find((x) => x.id === 'door-ext-alu')!;
  assert.ok(sys && sys.panels && sys.mode === 'door');
  assert.ok(presetsFor('door').some((p) => p.key === 'ext-door-side-r'));
  assert.ok(PANELS.length > 200 && PANELS.every((p) => p.file.endsWith('.webp')));
  assert.equal(new Set(PANELS.map((p) => p.file)).size, PANELS.length, 'unique files');
  const pc = PANELS.find((p) => !p.combo)!;
  const layout = presetsFor('door').find((p) => p.key === 'ext-door-side-r')!.layout;
  const w0 = win({ systemId: 'door-ext-alu', layout, width: 1300, height: 2100 });
  const w1 = { ...w0, panel: { code: pc.code, file: pc.file, series: pc.series, combo: pc.combo } };
  const rates = { aluminium: { cost: 100, sell: 180 }, traditional: { cost: 0, sell: 0 }, inox: { cost: 0, sell: 0 } };
  const c0 = calcWindow(w0, { ...ctx(), panelRates: rates });
  const c1 = calcWindow(w1, { ...ctx(), panelRates: rates });
  assert.deepEqual(c1.errors, []);
  const row = c1.addons!.find((a) => a.label.startsWith('Paneli'))!;
  assert.ok(row);
  if (pc.series === 'aluminium') { assert.equal(row.sell, 180); assert.ok(c1.price > c0.price); }
  const params = sys.params;
  const d = buildDrawing(1300, 2100, layout, params, { dims: true, panel: w1.panel });
  const img = d.shapes.find((x) => x.k === 'image') as any;
  assert.ok(img && img.href === `panels/${pc.file}`);
  assert.ok(img.w < 1300 && img.h < 2100, 'panel only covers the door leaf, not the side panel');
  assert.ok(drawingToSvg(d).includes('<image'));
  const combo = PANELS.find((p) => p.combo)!;
  const dc = buildDrawing(1300, 2100, layout, params, { panel: { code: combo.code, file: combo.file, series: combo.series, combo: true } });
  const ic = dc.shapes.find((x) => x.k === 'image') as any;
  assert.equal(ic.w, 1300);
});

t('roller shutter + nets: drawing and pricing', () => {
  const ctx2 = () => ({ ...ctx(), shutter: { costM2: 10, sellM2: 20, motorCost: 100, motorSell: 150, minArea: 0, netCostM2: 5, netSellM2: 8 } });
  const w0 = win({ systemId: 'alumil-s560', layout: buildMulti('slide', 2), width: 2000, height: 1500 });
  const base = calcWindow(w0, ctx2());
  assert.equal(base.addons!.length, 0);
  const w1 = { ...w0, shutter: { enabled: true, boxH: 250, motor: true }, nets: { '1-1': true } };
  const c1 = calcWindow(w1, ctx2());
  const sh = c1.addons!.find((a) => a.label.startsWith('Roletë'))!;
  assert.ok(Math.abs(sh.qty - 3) < 1e-9, '2.0 x 1.5 m = 3 m2');
  assert.ok(Math.abs(sh.cost - 30) < 1e-9 && Math.abs(sh.sell - 60) < 1e-9);
  assert.equal(c1.addons!.find((a) => a.label.startsWith('Motor'))!.sell, 150);
  const net = c1.addons!.find((a) => a.label.startsWith('Rrjet'))!;
  assert.ok(net.qty > 0 && net.qty < 3);
  assert.ok(c1.costs.total - base.costs.total > 130 + net.cost - 1e-6 && c1.price > base.price + 210, 'addons add to cost and price');
  // drawing: box added on top, window moved down, viewBox taller
  const d0 = buildDrawing(2000, 1500, w0.layout, ctx().systems.get('alumil-s560')!.params, { dims: true });
  const d1 = buildDrawing(2000, 1500, w1.layout, ctx().systems.get('alumil-s560')!.params, { dims: true, shutter: w1.shutter, nets: w1.nets });
  assert.equal(d1.vb.h, d0.vb.h + 250);
  assert.ok(d1.shapes.length > d0.shapes.length);
  const outer = d1.shapes.find((x) => x.k === 'rect' && x.w === 2000 && x.h === 1500) as any;
  assert.equal(outer.y, 250, 'window starts below the box');
  assert.ok(drawingToSvg(d1).includes('Kuti roletë'));
  // disabled shutter changes nothing
  const d2 = buildDrawing(2000, 1500, w0.layout, ctx().systems.get('alumil-s560')!.params, { dims: true, shutter: { enabled: false, boxH: 250, motor: true } });
  assert.equal(d2.shapes.length, d0.shapes.length);
});

t('shutter-only item: kinds, motor, persiane, drawing', () => {
  const rates = { costM2: 1, sellM2: 2, motorCost: 3, motorSell: 4, minArea: 0, netCostM2: 0, netSellM2: 0,
    kinds: { alu: { costM2: 10, sellM2: 20, motorCost: 100, motorSell: 150 }, persian: { costM2: 30, sellM2: 50, motorCost: 0, motorSell: 0 } } };
  const c0 = () => ({ ...ctx(), shutter: rates });
  const mk = (kind: any, motor: boolean) => win({ systemId: 'shutter-only', width: 1000, height: 1200, pricing: { method: 'm2', unitPrice: 0, manualTotal: 0, marginPct: 0 },
    shutter: { enabled: true, only: true, kind, boxH: 250, motor } });
  assert.ok(c0().systems.has('shutter-only'));
  const a = calcWindow(mk('alu', true), c0());
  assert.equal(a.errors.length, 0);
  assert.equal(a.glass.length, 0);
  assert.equal(a.pieces.length, 0);
  assert.ok(Math.abs(a.price - (1.2 * 20 + 150)) < 1e-6, 'price = area*sell + motor');
  assert.ok(Math.abs(a.costs.total - (1.2 * 10 + 100)) < 1e-6);
  const a2 = calcWindow(mk('alu', false), c0());
  assert.ok(Math.abs(a2.price - 24) < 1e-6);
  const th = calcWindow(mk('thermal', false), c0());
  assert.ok(Math.abs(th.price - 1.2 * 2) < 1e-6, 'unset kind falls back to base rates');
  const pe = calcWindow(mk('persian', true), c0());
  assert.ok(Math.abs(pe.price - 1.2 * 50) < 1e-6, 'persiane has no motor');
  assert.ok(pe.addons!.every((x) => !x.label.startsWith('Motor')));
  const sys = c0().systems.get('shutter-only')!;
  const d = buildDrawing(1000, 1200, mk('alu', true).layout, sys.params, { dims: true, shutter: mk('alu', true).shutter });
  assert.ok(d.shapes.length > 5 && drawingToSvg(d).includes('Grilë me litar alumini'));
  const dp = buildDrawing(1000, 1200, mk('persian', false).layout, sys.params, { dims: true, shutter: mk('persian', false).shutter });
  assert.ok(drawingToSvg(dp).includes('Persiane'));
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
  const frame = c.pieces.filter((p) => p.profileId === 'kom76md-frame');
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
