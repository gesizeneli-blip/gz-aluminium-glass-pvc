import type { Accessory, AccLine, ColorDef, GlassType, LaborRate, Material, Profile, ProfileCategory, RecipeLine, System, SystemMode } from '../types';
import { DEFAULT_CATEGORIES } from '../engine/calc';

/**
 * INITIAL DATA ONLY. Nothing here is a factory-approved formula or a real price.
 * - All prices are 0 -> the owner must enter his purchase/selling prices.
 * - All deductions/allowances (weldAllow, sashAdd, glass deductions, ...) are 0 -> the owner
 *   must fill them in from the supplier catalogue. Systems are flagged "verified: false".
 * - frameW / sashW / mullionW / depths are preliminary drawing values, to be verified.
 * Everything can be edited, duplicated or deleted in the app.
 */

export const SEED_VERSION = 3;
const uid = (p: string, n: string) => `${p}-${n}`;

/** What the owner gave us as real numbers: 3 cm bottom channel, 32 cm glass handles. Everything else is 0 / to be verified. */
export const CHANNEL_MM = 30;
export const GLASS_HANDLE_MM = 320;

type Kind = 'frame' | 'glass';
interface SysSpec {
  id: string;
  name: string;
  group: string;
  mode: SystemMode;
  material: Material;
  kind: Kind;
  depth: number;
  frameW: number;
  sashW: number;
  mullionW: number;
  maxSashW?: number;
  defaultGlass: string;
  /** glass systems: which profile lines exist */
  glassLines?: ('channel' | 'track-top' | 'track-bottom')[];
  topBottomTracks?: boolean;
  note?: string;
  panels?: boolean;
}

const FR = (id: string, name: string, group: string, mode: SystemMode, material: 'pvc' | 'alu', depth: number, frameW: number, sashW: number, mullionW: number, maxSashW: number, note = ''): SysSpec =>
  ({ id, name, group, mode, material, kind: 'frame', depth, frameW, sashW, mullionW, maxSashW, defaultGlass: 'g-double', note });
const GL = (id: string, name: string, group: string, mode: SystemMode, glass: string, lines: SysSpec['glassLines'], note = ''): SysSpec =>
  ({ id, name, group, mode, material: 'glass', kind: 'glass', depth: CHANNEL_MM, frameW: 0, sashW: 0, mullionW: 0, defaultGlass: glass, glassLines: lines, note });

export const GROUP_ORDER = ['Dyer të jashtme', 'Alumin i thjeshtë', 'Alumil', 'PVC', 'Palosje (bifold)', 'Pasqyra', 'Ndarje ambienti', 'Kabina dushi'];

const SPECS: SysSpec[] = [
  { ...FR('door-ext-alu', 'Derë e jashtme alumini (me panel)', 'Dyer të jashtme', 'door', 'alu', 70, 60, 80, 80, 0, 'Paneli (modeli) zgjidhet te dritarja. Çmimi i panelit sipas serisë: Cilësime → Punë krahu.'), panels: true },
  FR('alu-open', 'Alumin i thjeshtë – me hapje', 'Alumin i thjeshtë', 'swing', 'alu', 50, 40, 45, 45, 1000, 'Xham dopio ose tek xham (zgjidhet te dritarja).'),
  FR('alu-slide', 'Alumin i thjeshtë – me shinë', 'Alumin i thjeshtë', 'slide', 'alu', 50, 40, 45, 45, 1200, 'Xham dopio ose tek xham (zgjidhet te dritarja).'),
  FR('alumil-s67', 'Alumil S67 (me hapje)', 'Alumil', 'swing', 'alu', 67, 45, 55, 55, 1000),
  FR('alumil-s77', 'Alumil S77 (me hapje)', 'Alumil', 'swing', 'alu', 77, 45, 55, 55, 1000),
  FR('alumil-s350', 'Alumil S350 – Skorevel (2 ose më shumë kanate të lëvizshme)', 'Alumil', 'slide', 'alu', 50, 45, 55, 55, 1200),
  FR('alumil-s560', 'Alumil S560 – Skorevel (fikse anësore + e lëvizshme, ose të dyja të lëvizshme)', 'Alumil', 'slide', 'alu', 60, 45, 55, 55, 1200),
  FR('kom76md', 'Kömmerling 76 MM MD', 'PVC', 'swing', 'pvc', 76, 60, 75, 80, 900, 'Figura me 2 ose më shumë kanate sipas përmasave.'),
  FR('kom76ad', 'Kömmerling 76 MM AD', 'PVC', 'swing', 'pvc', 76, 60, 75, 80, 900, 'Figura me 2 ose më shumë kanate sipas përmasave.'),
  FR('weiss72ad', 'Weiss 72 MM AD', 'PVC', 'swing', 'pvc', 72, 60, 75, 80, 900, 'Figura me 2 ose më shumë kanate sipas përmasave.'),
  FR('weiss60ad', 'Weiss 60 MM AD', 'PVC', 'swing', 'pvc', 60, 55, 70, 75, 900, 'Figura me 2 ose më shumë kanate sipas përmasave.'),
  { ...FR('bifold-alu', 'Palosje alumini (shinë sipër dhe poshtë)', 'Palosje (bifold)', 'fold', 'alu', 70, 45, 55, 55, 900), defaultGlass: 'g-tempered' },
  GL('bifold-glass', 'Palosje vetëm xham (shinë vetëm sipër)', 'Palosje (bifold)', 'fold', 'g-tempered10', ['track-top']),
  GL('mirror', 'Pasqyrë', 'Pasqyra', 'fixed', 'g-mirror5', [], 'Modelet e pasqyrave: shtoji te Materialet. Lustrimi i buzëve llogaritet për ml te aksesorët.'),
  GL('partition-glass', 'Ndarje ambienti me xham (kasë 3 cm poshtë)', 'Ndarje ambienti', 'fixed', 'g-tempered10', ['channel'], 'Kasa/kanali poshtë 3 cm (30 mm).'),
  GL('glass-door', 'Derë xhami (menteshë sipër + poshtë, dorezë 32 cm)', 'Ndarje ambienti', 'door', 'g-tempered10', [], 'Dorezat e xhamit 32 cm.'),
  GL('shower-slide', 'Kabinë dushi – Skorevel (rrëshqitëse)', 'Kabina dushi', 'slide', 'g-tempered8', ['track-top', 'track-bottom']),
  GL('shower-door', 'Kabinë dushi – me derë', 'Kabina dushi', 'door', 'g-tempered8', []),
  GL('shower-fold', 'Kabinë dushi – me palosje', 'Kabina dushi', 'fold', 'g-tempered8', ['track-top']),
  GL('shower-fixed', 'Kabinë dushi – vetëm xham fiks', 'Kabina dushi', 'fixed', 'g-tempered8', [])
];

const GLASS_FORMULAS = {
  fixedW: 'CW - fixedGlassDeduct',
  fixedH: 'CH - fixedGlassDeduct',
  sashW: 'SW - 2*sashW + 2*sashRebate - sashGlassDeduct',
  sashH: 'SH - 2*sashW + 2*sashRebate - sashGlassDeduct'
};

function profilesFor(spec: SysSpec): Profile[] {
  const mk = (key: string, name: string, category: string): Profile => ({
    id: uid(spec.id, key), name: `${name} – ${spec.name}`, code: '', systemId: spec.id, category,
    purchasePerM: 0, sellPerM: 0, barLength: 6000, customBarLength: undefined, kerf: 3, cutAllowance: 0,
    wastePct: 0, formulaNote: '', stock: 0, supplier: '', notes: 'Çmimi dhe kodi: plotëso nga katalogu / furnitori.'
  });
  if (spec.kind === 'glass') {
    const out: Profile[] = [];
    for (const l of spec.glassLines ?? []) {
      if (l === 'channel') out.push(mk('channel', 'Kasë / kanal poshtë 3 cm', 'frame'));
      if (l === 'track-top') out.push(mk('track-top', 'Shinë sipër', 'frame'));
      if (l === 'track-bottom') out.push(mk('track-bottom', 'Shinë poshtë', 'frame'));
    }
    return out;
  }
  const slide = spec.mode === 'slide';
  const fold = spec.mode === 'fold';
  const list = [
    mk('frame', slide ? 'Kasë / shinë' : fold ? 'Kasë / shinë sipër-poshtë' : 'Kasë', 'frame'),
    mk('sash', 'Kanat', 'sash'),
    mk('mullion', slide ? 'Montant mbyllës' : 'Montant / ndarëse', 'mullion'),
    mk('bead', 'Fiksim qelqi (bead)', 'bead'),
    mk('gasket', 'Garniturë', 'gasket')
  ];
  if (spec.material === 'pvc') {
    list.push(mk('reinf-frame', 'Armaturë çeliku kasë', 'reinforcement'));
    list.push(mk('reinf-sash', 'Armaturë çeliku kanat', 'reinforcement'));
    list.push(mk('reinf-mull', 'Armaturë çeliku montant', 'reinforcement'));
  }
  return list;
}

function recipeFor(spec: SysSpec): RecipeLine[] {
  const L = (id: string, label: string, scope: RecipeLine['scope'], profile: string, len: string, qty: string, kind: 'bar' | 'meter' = 'bar', enabled = true): RecipeLine => ({
    id, label, scope, profileId: uid(spec.id, profile), kind, lengthFormula: len, qtyFormula: qty, enabled
  });
  if (spec.kind === 'glass') {
    const lines: RecipeLine[] = [];
    for (const l of spec.glassLines ?? []) {
      if (l === 'channel') lines.push(L('ch', `Kasë / kanal poshtë ${CHANNEL_MM / 10} cm`, 'window', 'channel', 'W', '1'));
      if (l === 'track-top') lines.push(L('tt', 'Shinë sipër', 'window', 'track-top', 'W', '1'));
      if (l === 'track-bottom') lines.push(L('tb', 'Shinë poshtë', 'window', 'track-bottom', 'W', '1'));
    }
    return lines;
  }
  const pvc = spec.material === 'pvc';
  const a = pvc ? 'weldAllow' : 'cutAdj';
  const lines: RecipeLine[] = [
    L('f-h', spec.mode === 'swing' ? 'Kasë – pjesë horizontale' : 'Kasë / shinë – sipër dhe poshtë', 'window', 'frame', `W + ${a}`, '2'),
    L('f-v', 'Kasë – pjesë vertikale', 'window', 'frame', `H + ${a}`, '2'),
    L('s-h', 'Kanat – horizontale', 'sash', 'sash', `SW + ${a}`, '2'),
    L('s-v', 'Kanat – vertikale', 'sash', 'sash', `SH + ${a}`, '2'),
    L('m-v', spec.mode === 'slide' ? 'Montant mbyllës vertikal' : 'Montant vertikal', 'mullionV', 'mullion', 'MH + mullionAdd', '1'),
    L('m-h', 'Ndarëse horizontale', 'mullionH', 'mullion', 'MH + mullionAdd', '1'),
    L('b-w', 'Fiksim qelqi – gjerësi', 'cell', 'bead', 'GW + beadAdd', '2'),
    L('b-h', 'Fiksim qelqi – lartësi', 'cell', 'bead', 'GH + beadAdd', '2'),
    L('g-f', 'Garniturë kasë', 'window', 'gasket', '2*(W+H)', '1', 'meter'),
    L('g-s', 'Garniturë kanat', 'sash', 'gasket', '2*(SW+SH)', '1', 'meter')
  ];
  if (pvc) {
    lines.push(
      L('r-fh', 'Armaturë kasë – horizontale', 'window', 'reinf-frame', 'W - reinfDeduct', '2'),
      L('r-fv', 'Armaturë kasë – vertikale', 'window', 'reinf-frame', 'H - reinfDeduct', '2'),
      L('r-sh', 'Armaturë kanat – horizontale', 'sash', 'reinf-sash', 'SW - reinfDeduct', '2'),
      L('r-sv', 'Armaturë kanat – vertikale', 'sash', 'reinf-sash', 'SH - reinfDeduct', '2'),
      L('r-mv', 'Armaturë montant vertikal', 'mullionV', 'reinf-mull', 'MH - reinfDeduct', '1'),
      L('r-mh', 'Armaturë ndarëse horizontale', 'mullionH', 'reinf-mull', 'MH - reinfDeduct', '1')
    );
  }
  return lines;
}

export const ACCESSORIES: Accessory[] = [
  ['handle', 'Dorezë dritareje', 'copë'],
  ['gu-tt', 'Mekanizëm anim + hapje (GU)', 'copë'],
  ['gu-turn', 'Mekanizëm hapje', 'copë'],
  ['gu-tilt', 'Mekanizëm anim', 'copë'],
  ['hinge', 'Menteshë', 'copë'],
  ['lock', 'Mbyllës / pika mbyllëse', 'copë'],
  ['slide', 'Mekanizëm rrëshqitës', 'copë'],
  ['door-handle', 'Dorezë porte', 'copë'],
  ['cylinder', 'Cilindër brave', 'copë'],
  ['door-hinge', 'Menteshë porte', 'copë'],
  ['reze', 'Rezë', 'copë'],
  ['screws', 'Vida (set)', 'copë'],
  ['connector', 'Lidhëse / konektorë', 'copë'],
  ['glass-hinge', 'Menteshë xhami (sipër / poshtë)', 'copë'],
  ['glass-handle-320', `Dorezë xhami ${GLASS_HANDLE_MM / 10} cm`, 'copë'],
  ['glass-slide-kit', 'Set rrëshqitës për xham (rul + shinë)', 'copë'],
  ['fold-hinge', 'Menteshë palosjeje', 'copë'],
  ['fold-roller', 'Rul / karrel palosjeje', 'copë'],
  ['fold-lock', 'Mbyllës palosjeje', 'copë'],
  ['seal-strip', 'Gomë / garniturë xhami', 'ml'],
  ['polish', 'Lustrim buzësh (për ml)', 'ml'],
  ['mirror-hang', 'Set varëse pasqyre', 'copë']
].map(([id, name, unit]) => ({ id, name, unit, purchase: 0, sell: 0, stock: 0, supplier: '', notes: '' }));

function accRecipeFor(spec: SysSpec): AccLine[] {
  const A = (id: string, label: string, accessoryId: string, match: AccLine['match'], qty: string): AccLine => ({
    id, label, accessoryId, match, qtyFormula: qty, enabled: true
  });
  if (spec.kind === 'glass') {
    if (spec.id === 'mirror') {
      return [
        A('m-p', 'Lustrim buzësh (ml)', 'polish', 'window', '2*(W+H)/1000'),
        A('m-h', 'Set varëse', 'mirror-hang', 'window', '1')
      ];
    }
    const out: AccLine[] = [
      A('g-d-h', 'Derë xhami: menteshë (sipër + poshtë)', 'glass-hinge', 'door', '2'),
      A('g-d-d', `Derë xhami: dorezë ${GLASS_HANDLE_MM / 10} cm`, 'glass-handle-320', 'door', '1'),
      A('g-s-k', 'Rrëshqitëse: set rrëshqitës', 'glass-slide-kit', 'slide', '1'),
      A('g-s-h', `Rrëshqitëse: dorezë ${GLASS_HANDLE_MM / 10} cm`, 'glass-handle-320', 'slide', '1'),
      A('g-f-h', 'Palosje: menteshë', 'fold-hinge', 'fold', '2'),
      A('g-f-r', 'Palosje: rul', 'fold-roller', 'fold', '1'),
      A('g-f-d', `Palosje: dorezë ${GLASS_HANDLE_MM / 10} cm`, 'glass-handle-320', 'fold', '1'),
      A('g-w-p', 'Lustrim buzësh (ml)', 'polish', 'any-sash', '2*(SW+SH)/1000'),
      A('g-w-s', 'Gomë / garniturë (ml)', 'seal-strip', 'window', '(W+2*H)/1000')
    ];
    return out;
  }
  const base = [
    A('tt-h', 'Anim+hapje: dorezë', 'handle', 'tilt-turn', '1'),
    A('tt-m', 'Anim+hapje: mekanizëm', 'gu-tt', 'tilt-turn', '1'),
    A('tt-hi', 'Anim+hapje: menteshë', 'hinge', 'tilt-turn', '2'),
    A('tt-l', 'Anim+hapje: mbyllës', 'lock', 'tilt-turn', '1'),
    A('t-h', 'Hapje: dorezë', 'handle', 'turn', '1'),
    A('t-m', 'Hapje: mekanizëm', 'gu-turn', 'turn', '1'),
    A('t-hi', 'Hapje: menteshë', 'hinge', 'turn', '2'),
    A('t-l', 'Hapje: mbyllës', 'lock', 'turn', '1'),
    A('ti-h', 'Anim: dorezë', 'handle', 'tilt', '1'),
    A('ti-m', 'Anim: mekanizëm', 'gu-tilt', 'tilt', '1'),
    A('ti-hi', 'Anim: menteshë', 'hinge', 'tilt', '2'),
    A('s-m', 'Rrëshqitëse: mekanizëm', 'slide', 'slide', '1'),
    A('s-h', 'Rrëshqitëse: dorezë', 'handle', 'slide', '1'),
    A('s-l', 'Rrëshqitëse: mbyllës', 'lock', 'slide', '1'),
    A('f-hi', 'Palosje: menteshë', 'fold-hinge', 'fold', '2'),
    A('f-r', 'Palosje: rul (sipër)', 'fold-roller', 'fold', '1'),
    A('f-l', 'Palosje: mbyllës', 'fold-lock', 'fold', '1'),
    A('d-h', 'Derë: dorezë', 'door-handle', 'door', '1'),
    A('d-c', 'Derë: cilindër', 'cylinder', 'door', '1'),
    A('d-hi', 'Derë: menteshë', 'door-hinge', 'door', '3'),
    A('d-l', 'Derë: mbyllës', 'lock', 'door', '1'),
    A('w-v', 'Vida (për dritare)', 'screws', 'window', '1'),
    A('w-c', 'Lidhëse (për dritare)', 'connector', 'window', '1')
  ];
  if (spec.id === 'bifold-alu') base.push(A('f-r2', 'Palosje: rul (poshtë)', 'fold-roller', 'fold', '1'));
  return base;
}

export function buildSystemsAndProfiles(): { systems: System[]; profiles: Profile[] } {
  const systems: System[] = [];
  const profiles: Profile[] = [];
  for (const spec of SPECS) {
    const pvc = spec.material === 'pvc';
    const params: Record<string, number> = {
      frameW: spec.frameW, sashW: spec.sashW, mullionW: spec.mullionW,
      frameDepth: spec.depth, sashDepth: spec.kind === 'glass' ? 12 : spec.depth - 10,
      sashAdd: 0, mullionAdd: 0, beadAdd: 0,
      fixedGlassDeduct: 0, sashRebate: 0, sashGlassDeduct: 0
    };
    if (spec.maxSashW) params.maxSashW = spec.maxSashW;
    if (spec.kind === 'frame') { if (pvc) { params.weldAllow = 0; params.reinfDeduct = 0; } else params.cutAdj = 0; }
    systems.push({
      id: spec.id, name: spec.name, material: spec.material, group: spec.group, mode: spec.mode, panels: spec.panels,
      defaultGlassId: spec.defaultGlass, params,
      glassFormulas: { ...GLASS_FORMULAS }, recipe: recipeFor(spec), accRecipe: accRecipeFor(spec),
      verified: false,
      notes: (spec.note ? spec.note + ' ' : '') + 'Vlera fillestare. Zbritjet/shtesat janë 0 dhe duhen plotësuar nga katalogu i prodhuesit.'
        + (spec.kind === 'glass' ? ' Sistem vetëm me xham: pa kasë anësore (frameW = 0).' : ' Gjerësitë e profileve (frameW, sashW, mullionW) dhe thellësitë janë vlera paraprake për vizatim.')
    });
    profiles.push(...profilesFor(spec));
  }
  return { systems, profiles };
}

export const GLASS_TYPES: GlassType[] = [
  { id: 'g-single4', name: 'Xham i thjeshtë 4 mm', composition: '4 mm transparent', kind: 'Xham i thjeshtë', thickness: 4 },
  { id: 'g-double', name: 'Dopio xham 4-16-4', composition: '4+16+4 transparent', kind: 'Dopio xham', thickness: 24 },
  { id: 'g-double-thermal', name: 'Dopio xham termik', composition: '4+16+4 low-E', kind: 'Termik', thickness: 24 },
  { id: 'g-triple', name: 'Triple xham', composition: '4+12+4+12+4', kind: 'Triple xham', thickness: 36 },
  { id: 'g-triplex', name: 'Triplex 3+3', composition: '3+3 triplex', kind: 'Laminuar (Triplex)', thickness: 6 },
  { id: 'g-tempered', name: 'Xham i kalitur 6 mm', composition: '6 mm i kalitur', kind: 'I kalitur', thickness: 6 },
  { id: 'g-tempered8', name: 'Xham i kalitur 8 mm', composition: '8 mm i kalitur', kind: 'I kalitur', thickness: 8 },
  { id: 'g-tempered10', name: 'Xham i kalitur 10 mm', composition: '10 mm i kalitur', kind: 'I kalitur', thickness: 10 },
  { id: 'g-mirror4', name: 'Pasqyrë 4 mm', composition: '4 mm pasqyrë', kind: 'Pasqyrë', thickness: 4 },
  { id: 'g-mirror5', name: 'Pasqyrë 5 mm', composition: '5 mm pasqyrë', kind: 'Pasqyrë', thickness: 5 },
  { id: 'g-frosted', name: 'Xham i mbrujtur (mat) 4 mm', composition: '4 mm mat', kind: 'I mbrujtur', thickness: 4 },
  { id: 'g-s67', name: 'Shembull S67: 3+3 Triplex + 4 + 3+3 Triplex termik', composition: '3+3 Triplex + 4 mm transparent + 3+3 Triplex thermal', kind: 'Kompozim i personalizuar', thickness: 16 },
  { id: 'g-s560', name: 'Shembull S560: 3+3 Triplex + 3+3 Triplex termik', composition: '3+3 Triplex + 3+3 Triplex thermal', kind: 'Kompozim i personalizuar', thickness: 12 }
].map((g) => ({ ...g, supplier: '', purchasePerM2: 0, sellPerM2: 0, minArea: 0, notes: g.id.startsWith('g-s') ? 'Shembull fillestar – i redaktueshëm. Trashësia është përafrim.' : '' }));

export const LABOR_RATES: LaborRate[] = [
  { id: 'l-prod', name: 'Prodhim (për m²)', unit: 'm2', rate: 0, defaultOn: true },
  { id: 'l-install', name: 'Montim (për copë)', unit: 'window', rate: 0, defaultOn: false }
];

export const COLORS: ColorDef[] = [
  { name: 'E bardhë', hex: '#f4f4f2' },
  { name: 'Antracit', hex: '#383e42' },
  { name: 'Kafe', hex: '#5b3a29' },
  { name: 'Dru dushku (Golden Oak)', hex: '#a9743c' },
  { name: 'E zezë', hex: '#1b1b1b' },
  { name: 'Argjend natyror', hex: '#b8bcc0' }
];

export const DEFAULT_SETTINGS = {
  business: {
    name: 'GZ ALUMINIUM GLASS & PVC',
    email: 'gesi.zeneli@hotmail.com',
    phone: '+355 68 204 3431',
    instagram: '@punimealuminii',
    nipt: 'L42110018F',
    address: '',
    signer: 'GEZIM ZENELI'
  },
  quote: {
    validityDays: 15,
    payment: 'Sipas marrëveshjes.',
    notes: '',
    vatPct: 0,
    showDrawings: true
  },
  pdf: { accent: '#c9a227', navy: '#0f1b2d', footer: '' },
  appearance: { bigButtons: false, theme: 'dark' as 'dark' | 'light' },
  currency: { code: 'ALL', symbol: 'L' }
};

export const SEED_CATEGORIES: ProfileCategory[] = DEFAULT_CATEGORIES;
