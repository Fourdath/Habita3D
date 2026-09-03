import { getInteriorStyle } from './interior-style-catalog';
import type { BudgetItem, InteriorStyleId } from './interior-style.types';

/** Extra material bought to cover cuts/waste, applied only to area-based (m2) items. */
const FLOOR_AREA_WASTE_FACTOR = 1.1;

export interface BudgetLineItem extends BudgetItem {
  subtotalClp: number;
}

export interface BudgetSummary {
  styleId: InteriorStyleId;
  /** Always true — these are demonstrative prices, never real product data. See DESIGN scope. */
  isDemoPricing: true;
  items: BudgetLineItem[];
  totalClp: number;
}

const CLP_FORMATTER = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

export function formatClp(amountClp: number): string {
  return CLP_FORMATTER.format(amountClp);
}

/**
 * Demonstrative budget for `styleId`. When `floorAreaM2` is a known positive number
 * (computed from the current Floorplan's rooms), m2-priced items (flooring) use
 * `floorAreaM2 * 1.1` (10% waste allowance) instead of their catalog placeholder
 * quantity — everything else (furniture counts, paint by the gallon) stays fixed,
 * since those aren't derivable from floor area.
 */
export function computeBudget(styleId: InteriorStyleId, floorAreaM2?: number): BudgetSummary {
  const style = getInteriorStyle(styleId);
  const hasReliableArea = typeof floorAreaM2 === 'number' && Number.isFinite(floorAreaM2) && floorAreaM2 > 0;

  const items: BudgetLineItem[] = style.budgetItems.map((item) => {
    const quantity =
      item.unit === 'm2' && hasReliableArea ? Number((floorAreaM2! * FLOOR_AREA_WASTE_FACTOR).toFixed(2)) : item.quantity;
    return { ...item, quantity, subtotalClp: Math.round(quantity * item.unitPriceClp) };
  });

  const totalClp = items.reduce((sum, item) => sum + item.subtotalClp, 0);

  return { styleId, isDemoPricing: true, items, totalClp };
}

/** Sum of every room's polygon area (shoelace formula), in square meters. Excludes nothing extra — same rooms cubicasa-parser.ts already excludes (e.g. Outdoor). */
export function computeFloorAreaM2(roomPolygons: [number, number][][]): number {
  let total = 0;
  for (const polygon of roomPolygons) {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      area += x1 * y2 - x2 * y1;
    }
    total += Math.abs(area) / 2;
  }
  return total;
}
