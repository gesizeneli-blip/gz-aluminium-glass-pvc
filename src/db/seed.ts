import type { Accessory, AccLine, ColorDef, GlassType, LaborRate, Material, Profile, ProfileCategory, RecipeLine, System } from '../types';
import { DEFAULT_CATEGORIES } from '../engine/calc';

/**
 * INITIAL DATA ONLY. Nothing here is a factory-approved formula or a real price.
 * - All prices are 0 -> the owner must enter his purchase/selling prices.
 * - All deductions/allowances (weldAllow, sashAdd, glass deductions, ...) are 0 -> the owner
 *   must fill them in from the supplier catalogue. Systems are flagged "verified: false".
 * - frameW / sashW / mullionW / depths are preliminary drawing values, to be verified.
 * Everything can be edited, duplicated or deleted in the app.
 */

const uid = (p: string, n: string) => `${p}-${n}`;

interface SysSpec {
  id: string;
  name: string;
  material: Material;
  depth: number;
  frameW: number;
  sashW: number;
  mullionW: number;
}

const SPECS: SysSpec[] = [
  { id: 'trocal70', name: 'TROCAL 70', material: 'pvc', depth: 70, frameW: 60, sashW: 75, mullionW: 80 },
  { id: 'trocal76md', name: 'TROCAL 76 MD', material: 'pvc', depth: 76, frameW: 60, sashW: 75, mullionW: 80 },
  { id: 'kommerling76md', name: 'Kömmerling 76 MD', material: 'pvc', depth: 76, frameW: 60, sashW: 75, mullionW: 80 },
  { id: 'alumils67', name: 'Alumil S67', material: 'alu', depth: 67, frameW: 45, sashW: 55, mullionW: 55 },
  { id: 'alumils560', name: 'Alumil S560', material: 'alu', depth: 60, frameW: 45, sashW: 55, mullionW: 55 },
  { id: 'weiss72', name: 'WEISS 72', material: 'alu', depth: 72, frameW: 45, sashW: 55, mullionW: 55 }
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
    purchasePerM: 0, sellPerM: 0, barLength: 6500, customBarLength: undefined, kerf: 3, cutAllowance: 0,
    wastePct: 0, formulaNote: '', stock: 0, supplier: '', notes: 'Çmimi dhe kodi: plotëso nga katalogu / furnitori.'
  });
  const list = [
    mk('frame', 'Kasë', 'frame'),
    mk('sash', 'Kanat', 'sash'),
    mk('mullion', 'Montant / ndarëse', 'mullion'),
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
  const pvc = spec.material === 'pvc';
  const a = pvc ? 'weldAllow' : 'cutAdj';
  const L = (id: string, label: string, scope: RecipeLine['scope'], profile: string, len: string, qty: string, kind: 'bar' | 'meter' = 'bar'): RecipeLine => ({
    id, label, scope, profileId: uid(spec.id, profile), kind, lengthFormula: len, qtyFormula: qty, enabled: true
  });
  const lines: RecipeLine[] = [
    L('f-h', 'Kasë – pjesë horizontale', 'window', 'frame', `W + ${a}`, '2'),
    L('f-v', 'Kasë – pjesë vertikale', 'window', 'frame', `H + ${a}`, '2'),
    L('s-h', 'Kanat – horizontale', 'sash', 'sash', `SW + ${a}`, '2'),
    L('s-v', 'Kanat – vertikale', 'sash', 'sash', `SH + ${a}`, '2'),
    L('m-v', 'Montant vertikal', 'mullionV', 'mullion', 'MH + mullionAdd', '1'),
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
  ['handle', 'Dorezë dritareje'],
  ['gu-tt', 'Mekanizëm anim + hapje (GU)'],
  ['gu-turn', 'Mekanizëm hapje'],
  ['gu-tilt', 'Mekanizëm anim'],
  ['hinge', 'Menteshë'],
  ['lock', 'Mbyllës / pika mbyllëse'],
  ['slide', 'Mekanizëm rrëshqitës'],
  ['door-handle', 'Dorezë porte'],
  ['cylinder', 'Cilindër brave'],
  ['door-hinge', 'Menteshë porte'],
  ['reze', 'Rezë'],
  ['screws', 'Vida (set)'],
  ['connector', 'Lidhëse / konektorë']
].map(([id, name]) => ({ id, name, unit: 'copë', purchase: 0, sell: 0, stock: 0, supplier: '', notes: '' }));

function accRecipe(): AccLine[] {
  const A = (id: string, label: string, accessoryId: string, match: AccLine['match'], qty: string): AccLine => ({
    id, label, accessoryId, match, qtyFormula: qty, enabled: true
  });
  return [
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
    A('d-h', 'Derë: dorezë', 'door-handle', 'door', '1'),
    A('d-c', 'Derë: cilindër', 'cylinder', 'door', '1'),
    A('d-hi', 'Derë: menteshë', 'door-hinge', 'door', '3'),
    A('d-l', 'Derë: mbyllës', 'lock', 'door', '1'),
    A('w-v', 'Vida (për dritare)', 'screws', 'window', '1'),
    A('w-c', 'Lidhëse (për dritare)', 'connector', 'window', '1')
  ];
}

export function buildSystemsAndProfiles(): { systems: System[]; profiles: Profile[] } {
  const systems: System[] = [];
  const profiles: Profile[] = [];
  for (const spec of SPECS) {
    const pvc = spec.material === 'pvc';
    const params: Record<string, number> = {
      frameW: spec.frameW, sashW: spec.sashW, mullionW: spec.mullionW,
      frameDepth: spec.depth, sashDepth: spec.depth - 10,
      sashAdd: 0, mullionAdd: 0, beadAdd: 0,
      fixedGlassDeduct: 0, sashRebate: 0, sashGlassDeduct: 0
    };
    if (pvc) { params.weldAllow = 0; params.reinfDeduct = 0; } else { params.cutAdj = 0; }
    systems.push({
      id: spec.id, name: spec.name, material: spec.material, params,
      glassFormulas: { ...GLASS_FORMULAS }, recipe: recipeFor(spec), accRecipe: accRecipe(),
      verified: false,
      notes: 'Vlera fillestare. Zbritjet/shtesat janë 0 dhe duhen plotësuar nga katalogu i prodhuesit. Gjerësitë e profileve (frameW, sashW, mullionW) dhe thellësitë janë vlera paraprake për vizatim.'
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
