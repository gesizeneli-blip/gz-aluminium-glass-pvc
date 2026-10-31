import { useMemo } from 'react';
import { buildDrawing, drawingToSvg } from '../engine/drawing';
import type { Layout } from '../types';

export function Drawing2D({
  W, H, layout, params, colorHex, glassLabels, showKeys
}: {
  W: number;
  H: number;
  layout: Layout;
  params: Record<string, number>;
  colorHex?: string;
  glassLabels?: Record<string, string>;
  showKeys?: boolean;
}) {
  const svg = useMemo(() => {
    if (!(W > 0 && H > 0)) return '';
    return drawingToSvg(buildDrawing(W, H, layout, params, { dims: true, colorHex, glassLabels, showKeys }));
  }, [W, H, layout, params, colorHex, glassLabels, showKeys]);
  return <div className="drawing" dangerouslySetInnerHTML={{ __html: svg }} />;
}
