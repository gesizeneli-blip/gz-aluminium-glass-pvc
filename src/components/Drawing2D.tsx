import { useMemo } from 'react';
import { buildDrawing, drawingToSvg } from '../engine/drawing';
import type { Layout, PanelChoice, ShapeDef, ShutterDef, TrimDef } from '../types';

export function Drawing2D({
  W, H, layout, params, colorHex, glassLabels, showKeys, shape, shutter, nets, panel, fills, trims, selected, onCell
}: {
  W: number;
  H: number;
  layout: Layout;
  params: Record<string, number>;
  colorHex?: string;
  glassLabels?: Record<string, string>;
  showKeys?: boolean;
  shape?: ShapeDef;
  shutter?: ShutterDef;
  nets?: Record<string, boolean>;
  panel?: PanelChoice;
  fills?: Record<string, string>;
  trims?: TrimDef;
  /** editor: click a part of the drawing to select it */
  selected?: string;
  onCell?: (key: string) => void;
}) {
  const svg = useMemo(() => {
    if (!(W > 0 && H > 0)) return '';
    return drawingToSvg(buildDrawing(W, H, layout, params, { dims: true, colorHex, glassLabels, showKeys, shape, shutter, nets, panel, fills, trims, hit: !!onCell, selected }));
  }, [W, H, layout, params, colorHex, glassLabels, showKeys, shape, shutter, nets, panel, fills, trims, selected, !!onCell]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className="drawing"
      dangerouslySetInnerHTML={{ __html: svg }}
      onClick={(e) => {
        if (!onCell) return;
        const el = (e.target as Element).closest?.('[data-cell]');
        const k = el?.getAttribute('data-cell');
        if (k) onCell(k);
      }}
    />
  );
}
