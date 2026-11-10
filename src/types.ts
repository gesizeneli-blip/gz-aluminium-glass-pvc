export type Material = 'pvc' | 'alu' | 'glass';

/** How the system behaves -> which opening models are offered */
export type SystemMode = 'swing' | 'slide' | 'fold' | 'fixed' | 'door';
export const MODE_LABELS: Record<SystemMode, string> = {
  swing: 'Me hapje', slide: 'Me shinë (rrëshqitës)', fold: 'Me palosje', fixed: 'Fikse', door: 'Me derë'
};

export type OpenType =
  | 'fixed'
  | 'turn-left'
  | 'turn-right'
  | 'tilt-turn-left'
  | 'tilt-turn-right'
  | 'tilt'
  | 'slide-left'
  | 'slide-right'
  | 'door-left'
  | 'door-right'
  | 'fold-left'
  | 'fold-right';

export const OPEN_LABELS: Record<OpenType, string> = {
  fixed: 'Fikse',
  'turn-left': 'Hapje (menteshë majtas)',
  'turn-right': 'Hapje (menteshë djathtas)',
  'tilt-turn-left': 'Anim + hapje (menteshë majtas)',
  'tilt-turn-right': 'Anim + hapje (menteshë djathtas)',
  tilt: 'Vetëm anim',
  'slide-left': 'Rrëshqitëse ← ',
  'slide-right': 'Rrëshqitëse →',
  'door-left': 'Derë (menteshë majtas)',
  'door-right': 'Derë (menteshë djathtas)',
  'fold-left': 'Palosje (mbledhje majtas)',
  'fold-right': 'Palosje (mbledhje djathtas)'
};

export type ShapeType = 'rect' | 'arch' | 'trapezoid' | 'triangle' | 'oval';
export const SHAPE_LABELS: Record<ShapeType, string> = {
  rect: 'Drejtkëndësh (standard)',
  arch: 'Hark (sipër i harkuar)',
  trapezoid: 'Trapez / pjerrët',
  triangle: 'Trekëndësh',
  oval: 'Rrethore / ovale'
};
export interface ShapeDef {
  type: ShapeType;
  /** arch: rise of the arch in mm */
  rise?: number;
  /** trapezoid: height of the lower side in mm */
  lowH?: number;
  lowSide?: 'left' | 'right';
  /** triangle: apex position, % of width from the left */
  apex?: number;
}

export interface Cell {
  open: OpenType;
  /** aperture height share in mm; undefined = auto */
  h?: number;
}
export interface Column {
  /** aperture width in mm; undefined = auto */
  w?: number;
  cells: Cell[];
}
export interface Layout {
  columns: Column[];
}

export type Scope = 'window' | 'cell' | 'sash' | 'fixed' | 'mullionV' | 'mullionH';

export interface RecipeLine {
  id: string;
  label: string;
  scope: Scope;
  profileId: string;
  kind: 'bar' | 'meter';
  lengthFormula: string;
  qtyFormula: string;
  enabled: boolean;
}

export type AccMatch = 'window' | 'any-sash' | 'turn' | 'tilt-turn' | 'tilt' | 'slide' | 'fold' | 'door' | 'fixed';

export interface AccLine {
  id: string;
  label: string;
  accessoryId: string;
  match: AccMatch;
  qtyFormula: string;
  enabled: boolean;
}

export interface GlassFormulas {
  fixedW: string;
  fixedH: string;
  sashW: string;
  sashH: string;
}

export interface System {
  id: string;
  name: string;
  material: Material;
  /** group shown in the system picker, e.g. 'Alumil' */
  group?: string;
  mode?: SystemMode;
  /** glass pre-selected when this system is chosen */
  defaultGlassId?: string;
  params: Record<string, number>;
  glassFormulas: GlassFormulas;
  recipe: RecipeLine[];
  accRecipe: AccLine[];
  verified: boolean;
  notes: string;
}

export interface Profile {
  id: string;
  name: string;
  code: string;
  systemId: string;
  category: string;
  purchasePerM: number;
  sellPerM: number;
  barLength: number;
  customBarLength?: number;
  kerf: number;
  cutAllowance: number;
  wastePct: number;
  formulaNote: string;
  stock: number;
  supplier: string;
  notes: string;
}

export interface GlassType {
  id: string;
  name: string;
  composition: string;
  kind: string;
  thickness: number;
  supplier: string;
  purchasePerM2: number;
  sellPerM2: number;
  minArea: number;
  notes: string;
}

export interface Accessory {
  id: string;
  name: string;
  unit: string;
  purchase: number;
  sell: number;
  stock: number;
  supplier: string;
  notes: string;
}

export interface LaborRate {
  id: string;
  name: string;
  unit: 'm2' | 'window' | 'ml';
  rate: number;
  defaultOn: boolean;
}

export interface ProfileCategory {
  key: string;
  label: string;
  group: 'profile' | 'reinforcement' | 'gasket';
}

export interface ColorDef {
  name: string;
  hex: string;
}

export interface Client {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export const PROJECT_STATUSES = ['Ofertë', 'Aktiv', 'Përfunduar', 'Anuluar'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id?: number;
  name: string;
  clientId?: number;
  clientName: string;
  phone: string;
  email: string;
  address: string;
  date: string;
  notes: string;
  status: ProjectStatus;
  createdAt: number;
}

export type PriceMethod = 'm2' | 'ml' | 'unit' | 'manual' | 'sellList' | 'margin';
export const PRICE_METHOD_LABELS: Record<PriceMethod, string> = {
  m2: 'Çmim për m²',
  ml: 'Çmim për metër linear (perimetër)',
  unit: 'Çmim fiks për copë',
  manual: 'Çmim total manual',
  sellList: 'Nga çmimet e shitjes së materialeve',
  margin: 'Kosto + marzh %'
};

export interface Pricing {
  method: PriceMethod;
  unitPrice: number;
  manualTotal: number;
  marginPct: number;
}

export interface ExtraCost {
  label: string;
  cost: number;
  price: number;
}
export interface ExtraPiece {
  profileId: string;
  length: number;
  qty: number;
  label: string;
}

/** Roller shutter box above the window (roletë rrotulluese) */
export interface ShutterDef {
  enabled: boolean;
  /** height of the shutter box in mm (sits above the window) */
  boxH: number;
  motor: boolean;
}
export const DEFAULT_SHUTTER: ShutterDef = { enabled: true, boxH: 250, motor: true };

/** Prices for the shutter / net add-ons (owner fills in; 0 by default) */
export interface ShutterRates {
  costM2: number;
  sellM2: number;
  motorCost: number;
  motorSell: number;
  minArea: number;
  netCostM2: number;
  netSellM2: number;
}
export const DEFAULT_SHUTTER_RATES: ShutterRates = { costM2: 0, sellM2: 0, motorCost: 0, motorSell: 0, minArea: 0, netCostM2: 0, netSellM2: 0 };

export interface AddonRow {
  label: string;
  qty: number;
  unit: string;
  cost: number; // per unit of window
  sell: number;
}

export interface WindowItem {
  id?: number;
  projectId: number;
  name: string;
  kind: string;
  width: number;
  height: number;
  qty: number;
  systemId: string;
  glassId: string;
  cellGlass: Record<string, string>;
  color: string;
  layout: Layout;
  shape?: ShapeDef;
  /** roller shutter above the window */
  shutter?: ShutterDef;
  /** insect screens (rrjeta) per cell key, e.g. { '1-1': true } */
  nets?: Record<string, boolean>;
  pricing: Pricing;
  laborIds: string[];
  extras: ExtraCost[];
  lineOff: Record<string, boolean>;
  extraPieces: ExtraPiece[];
  accQty: Record<string, number>;
  notes: string;
  order: number;
}

export interface Template {
  id?: number;
  name: string;
  layout: Layout;
}

/* ---------- Calculation results ---------- */
export interface PieceRow {
  lineId: string;
  profileId: string;
  label: string;
  length: number;
  qty: number;
  cell?: string;
  manual?: boolean;
}
export interface MeterRow {
  lineId: string;
  profileId: string;
  label: string;
  meters: number;
}
export interface ProfileUse {
  profileId: string;
  name: string;
  category: string;
  group: 'profile' | 'reinforcement' | 'gasket';
  mm: number;
  meters: number;
  pieces: number;
  cost: number;
  sell: number;
}
export interface GlassRow {
  cell: string;
  open: OpenType;
  glassId: string;
  glassName: string;
  composition: string;
  thickness: number;
  w: number;
  h: number;
  area: number;
  billedArea: number;
  qty: number;
  cost: number;
  sell: number;
}
export interface AccRow {
  accessoryId: string;
  name: string;
  unit: string;
  autoQty: number;
  qty: number;
  manual: boolean;
  cost: number;
  sell: number;
}
export interface CostBreakdown {
  profiles: number;
  reinforcement: number;
  glass: number;
  accessories: number;
  gaskets: number;
  labor: number;
  other: number;
  material: number;
  total: number;
}
export interface Calc {
  qty: number;
  area: number; // m2 per unit
  perimeter: number; // ml per unit
  errors: string[];
  warnings: string[];
  pieces: PieceRow[];
  meters: MeterRow[];
  profileUse: ProfileUse[];
  glass: GlassRow[];
  accessories: AccRow[];
  addons?: AddonRow[];
  costs: CostBreakdown; // totals for qty
  materialSell: number; // totals for qty (profiles+glass+accessories at sell prices)
  extrasPrice: number;
  price: number; // total selling price for qty
  profit: number;
  marginPct: number;
  profitPerM2: number;
  profitPerUnit: number;
}
