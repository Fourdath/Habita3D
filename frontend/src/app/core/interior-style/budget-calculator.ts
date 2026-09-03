import { getInteriorStyle } from './interior-style-catalog';
import type { Floorplan } from '../floorplan/floorplan.types';
import type { BudgetItem, BudgetQuantitySource, InteriorStyleId } from './interior-style.types';

export interface FloorplanMeasurements {
  floorAreaM2: number;
  interiorWallAreaM2: number;
  exteriorWallAreaM2: number;
  ceilingAreaM2: number;
  baseboardLengthM: number;
  doorCount: number;
  windowCount: number;
  lightCount: number;
}

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
 * Demonstrative budget for `styleId`. Measurable finish quantities come from the
 * current Floorplan and each catalog line can add its own waste allowance. Catalog
 * placeholder quantities are used only before a plan is available.
 */
export function computeBudget(styleId: InteriorStyleId, measurements?: FloorplanMeasurements): BudgetSummary {
  const style = getInteriorStyle(styleId);

  const items: BudgetLineItem[] = style.budgetItems.map((item) => {
    const measured = measurements ? measurementFor(item.quantitySource, measurements) : undefined;
    const baseQuantity = typeof measured === 'number' && Number.isFinite(measured) && measured >= 0 ? measured : item.quantity;
    const quantity = Number((baseQuantity * (item.wasteFactor ?? 1)).toFixed(2));
    return { ...item, quantity, subtotalClp: Math.round(quantity * item.unitPriceClp) };
  });

  const totalClp = items.reduce((sum, item) => sum + item.subtotalClp, 0);

  return { styleId, isDemoPricing: true, items, totalClp };
}

function measurementFor(source: BudgetQuantitySource, measurements: FloorplanMeasurements): number | undefined {
  return source === 'fixed' ? undefined : measurements[source];
}

/**
 * Derives the quantities that can be measured from a parsed plan. Wall areas count
 * both paintable faces of an interior partition and only the interior face of an
 * exterior wall; openings are subtracted from every affected face.
 */
export function computeFloorplanMeasurements(floorplan: Floorplan, wallHeightM: number): FloorplanMeasurements {
  const floorAreaM2 = computeFloorAreaM2(floorplan.rooms.map((room) => room.polygon));
  let interiorWallAreaM2 = 0;
  let exteriorWallAreaM2 = 0;
  let baseboardLengthM = 0;

  for (const wall of floorplan.walls) {
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const doors = floorplan.doors.filter((door) => door.wallId === wall.id);
    const windows = floorplan.windows.filter((windowOpening) => windowOpening.wallId === wall.id);
    const openingArea =
      doors.reduce((sum, door) => sum + door.width * door.height, 0) +
      windows.reduce((sum, windowOpening) => sum + windowOpening.width * windowOpening.height, 0);
    const interiorFaces = wall.isExterior ? 1 : 2;

    interiorWallAreaM2 += Math.max(0, length * wallHeightM - openingArea) * interiorFaces;
    baseboardLengthM += Math.max(0, length - doors.reduce((sum, door) => sum + door.width, 0)) * interiorFaces;
    if (wall.isExterior) {
      exteriorWallAreaM2 += Math.max(0, length * wallHeightM - openingArea);
    }
  }

  return {
    floorAreaM2,
    interiorWallAreaM2,
    exteriorWallAreaM2,
    ceilingAreaM2: floorAreaM2,
    baseboardLengthM,
    doorCount: floorplan.doors.length,
    windowCount: floorplan.windows.length,
    lightCount: floorplan.rooms.length,
  };
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
