import { resolveBaseboardSegments } from '../construction/baseboard-resolver';
import { calculateWallFaceRectangles, wallFaceNetArea, type WallFaceRectangle } from '../construction/wall-face-geometry';
import {
  DEFAULT_CONSTRUCTION_ASSUMPTIONS,
  resolveAllWallConstructions,
} from '../construction/wall-construction-resolver';
import { WALL_ASSEMBLY_CATALOG } from '../construction/wall-assembly.catalog';
import type {
  ConstructionAssumptions,
  WallConstructionOverride,
  WallSide,
} from '../construction/wall-assembly.types';
import { polygonArea } from '../floorplan/geometry-utils';
import { resolveKitchenRuns } from '../floorplan/kitchen-run-resolver';
import type { Floorplan } from '../floorplan/floorplan.types';
import { BACKSPLASH_HEIGHT_M } from '../floorplan/fixture.constants';
import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { ConstructionBudgetLine, ConstructionBudgetSummary } from './budget.types';
import { calculateCeramic } from './ceramic-calculator';
import { CONSTRUCTION_PRODUCT_CATALOG } from './construction-product.catalog';
import type { ConstructionProduct, ConstructionProductId } from './construction-product.types';
import { optimizeLinearCuts } from './linear-cut-optimizer';
import { optimizeSheetCuts, type RequiredSheetPiece } from './sheet-cut-optimizer';

export const DEFAULT_BUDGET_WALL_HEIGHT_M = 2.6;

export interface ConstructionBudgetOptions {
  wallHeightM?: number;
  assumptions?: ConstructionAssumptions;
  wallOverrides?: readonly WallConstructionOverride[];
  productCatalog?: Record<ConstructionProductId, ConstructionProduct>;
}

interface SheetDemand {
  productId: 'GYPSUM_BOARD_ST_12_5' | 'GYPSUM_BOARD_RH_12_5' | 'EXTERIOR_FIBERCEMENT_BOARD';
  rectangles: WallFaceRectangle[];
  demandKey: string;
}

export function computeConstructionBudget(
  floorplan: Floorplan,
  styleId: InteriorStyleId,
  options: ConstructionBudgetOptions = {},
): ConstructionBudgetSummary {
  const wallHeightM = options.wallHeightM ?? DEFAULT_BUDGET_WALL_HEIGHT_M;
  const catalog = options.productCatalog ?? CONSTRUCTION_PRODUCT_CATALOG;
  const constructions = !options.assumptions && !options.wallOverrides && floorplan.wallConstructions
    ? floorplan.wallConstructions
    : resolveAllWallConstructions(
        floorplan,
        options.assumptions ?? DEFAULT_CONSTRUCTION_ASSUMPTIONS,
        [...(options.wallOverrides ?? [])],
      );
  const rooms = new Map(floorplan.rooms.map((room) => [room.id, room]));
  const sheetDemand: SheetDemand[] = [];
  let concreteVolumeM3 = 0;
  let bathroomWallAreaM2 = 0;

  for (const construction of constructions) {
    const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
    if (!wall) continue;
    const rectangles = calculateWallFaceRectangles(floorplan, wall, wallHeightM);
    const netArea = wallFaceNetArea(rectangles);
    if (construction.assemblyId === 'INTERIOR_CONCRETE' || construction.assemblyId === 'EXTERIOR_CONCRETE') {
      concreteVolumeM3 += netArea * wall.thickness;
    }

    for (const side of [construction.sideA, construction.sideB]) {
      const roomSemantic = side.roomId ? rooms.get(side.roomId)?.semantic.type : undefined;
      if (side.environment === 'INTERIOR' && roomSemantic === 'BATHROOM') bathroomWallAreaM2 += netArea;
      const productId = sheetProductForSide(construction.assemblyId, side, roomSemantic);
      if (productId) sheetDemand.push({ productId, rectangles, demandKey: `${wall.id}_${side.side}` });
    }
  }

  const items: ConstructionBudgetLine[] = [];
  for (const productId of ['GYPSUM_BOARD_ST_12_5', 'GYPSUM_BOARD_RH_12_5', 'EXTERIOR_FIBERCEMENT_BOARD'] as const) {
    const demands = sheetDemand.filter((demand) => demand.productId === productId);
    if (demands.length === 0) continue;
    items.push(sheetBudgetLine(productId, demands, catalog[productId]));
  }

  const baseboardProductId = styleId === 'industrial' ? 'BASEBOARD_DARK' : 'BASEBOARD_WHITE';
  const baseboardSegments = resolveBaseboardSegments(floorplan, constructions);
  if (baseboardSegments.length > 0) {
    items.push(linearBudgetLine(baseboardProductId, baseboardSegments.map((segment) => segment.lengthM), catalog[baseboardProductId]));
  }

  if (styleId !== 'none') {
    const bathroomFloorAreaM2 = floorplan.rooms
      .filter((room) => room.semantic.type === 'BATHROOM')
      .reduce((sum, room) => sum + polygonArea(room.polygon), 0);
    const kitchenBacksplashAreaM2 = (floorplan.kitchenRuns ?? resolveKitchenRuns(floorplan))
      .reduce((sum, run) => sum + Math.hypot(run.end[0] - run.start[0], run.end[1] - run.start[1]) * BACKSPLASH_HEIGHT_M, 0);
    const wallCeramicId = styleId === 'nordic' ? 'CERAMIC_NORDIC_WALL' : 'CERAMIC_INDUSTRIAL_WALL';
    const floorCeramicId = styleId === 'nordic' ? 'CERAMIC_NORDIC_FLOOR' : 'CERAMIC_INDUSTRIAL_FLOOR';
    if (bathroomWallAreaM2 > 0) items.push(ceramicBudgetLine(`${wallCeramicId}_bathroom`, wallCeramicId, 'Cerámica de muros de baño', bathroomWallAreaM2, catalog[wallCeramicId]));
    if (bathroomFloorAreaM2 > 0) items.push(ceramicBudgetLine(`${floorCeramicId}_bathroom`, floorCeramicId, 'Cerámica de pisos de baño', bathroomFloorAreaM2, catalog[floorCeramicId]));
    if (kitchenBacksplashAreaM2 > 0) items.push(ceramicBudgetLine(`${wallCeramicId}_backsplash`, wallCeramicId, 'Cerámica de backsplash de cocina', kitchenBacksplashAreaM2, catalog[wallCeramicId]));
  }

  if (concreteVolumeM3 > 0) {
    const product = catalog.CONCRETE_M3;
    items.push(basicLine('CONCRETE_M3', product.name, concreteVolumeM3, concreteVolumeM3, product));
  }

  return {
    styleId,
    isDemoPricing: true,
    items,
    totalClp: items.reduce((sum, item) => sum + item.subtotalClp, 0),
    requiresStructuralSpecification: constructions.some((construction) => WALL_ASSEMBLY_CATALOG[construction.assemblyId].requiresStructuralSpecification),
  };
}

export function formatClp(amountClp: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amountClp);
}

function sheetProductForSide(
  assemblyId: string,
  side: WallSide,
  roomSemantic: string | undefined,
): SheetDemand['productId'] | undefined {
  if (assemblyId !== 'INTERIOR_LIGHT' && assemblyId !== 'EXTERIOR_LIGHT') return undefined;
  if (assemblyId === 'EXTERIOR_LIGHT' && side.environment === 'EXTERIOR') return 'EXTERIOR_FIBERCEMENT_BOARD';
  if (side.environment !== 'INTERIOR') return undefined;
  return roomSemantic === 'BATHROOM' ? 'GYPSUM_BOARD_RH_12_5' : 'GYPSUM_BOARD_ST_12_5';
}

function sheetBudgetLine(productId: SheetDemand['productId'], demands: SheetDemand[], product: ConstructionProduct): ConstructionBudgetLine {
  const stockWidth = requiredDimension(product.widthMeters, product.id, 'widthMeters');
  const stockHeight = requiredDimension(product.heightMeters, product.id, 'heightMeters');
  const pieces = demands.flatMap((demand) => demand.rectangles.flatMap((rectangle) =>
    splitForStock(rectangle, stockWidth, stockHeight, `${demand.demandKey}_${rectangle.id}`)));
  const optimization = optimizeSheetCuts({ width: stockWidth, height: stockHeight }, pieces);
  const stockArea = stockWidth * stockHeight;
  const requiredQuantity = optimization.requiredArea / stockArea;
  const line = basicLine(productId, product.name, requiredQuantity, optimization.sheetsUsed, product);
  line.optimizationSummary = optimization;
  line.waste = {
    unit: 'm2',
    required: optimization.requiredArea,
    purchased: optimization.totalStockArea,
    waste: optimization.wasteArea,
    utilizationPercent: optimization.utilizationPercent,
  };
  return line;
}

function splitForStock(
  rectangle: WallFaceRectangle,
  stockWidth: number,
  stockHeight: number,
  idPrefix: string,
): RequiredSheetPiece[] {
  const pieces: RequiredSheetPiece[] = [];
  let remainingWidth = rectangle.widthM;
  let column = 0;
  while (remainingWidth > 1e-7) {
    const width = Math.min(stockWidth, remainingWidth);
    let remainingHeight = rectangle.heightM;
    let row = 0;
    while (remainingHeight > 1e-7) {
      const height = Math.min(stockHeight, remainingHeight);
      pieces.push({ id: `${idPrefix}_${column}_${row}`, width, height });
      remainingHeight -= height;
      row++;
    }
    remainingWidth -= width;
    column++;
  }
  return pieces;
}

function linearBudgetLine(
  productId: 'BASEBOARD_WHITE' | 'BASEBOARD_DARK',
  requiredSegments: number[],
  product: ConstructionProduct,
): ConstructionBudgetLine {
  const stockLength = requiredDimension(product.lengthMeters, product.id, 'lengthMeters');
  const splittableCuts = requiredSegments.flatMap((segment) => splitLinearSegment(segment, stockLength));
  const optimization = optimizeLinearCuts(stockLength, splittableCuts);
  const line = basicLine(productId, product.name, optimization.requiredLength / stockLength, optimization.stockPiecesUsed, product);
  line.optimizationSummary = optimization;
  line.waste = {
    unit: 'm',
    required: optimization.requiredLength,
    purchased: optimization.purchasedLength,
    waste: optimization.wasteLength,
    utilizationPercent: optimization.utilizationPercent,
  };
  return line;
}

function splitLinearSegment(segment: number, stockLength: number): number[] {
  const cuts: number[] = [];
  let remaining = Math.max(0, segment);
  while (remaining > 1e-7) {
    const cut = Math.min(stockLength, remaining);
    cuts.push(cut);
    remaining -= cut;
  }
  return cuts;
}

function ceramicBudgetLine(
  id: string,
  productId: 'CERAMIC_NORDIC_WALL' | 'CERAMIC_NORDIC_FLOOR' | 'CERAMIC_INDUSTRIAL_WALL' | 'CERAMIC_INDUSTRIAL_FLOOR',
  description: string,
  areaM2: number,
  product: ConstructionProduct,
): ConstructionBudgetLine {
  const estimate = calculateCeramic(areaM2, product);
  const tileArea = requiredDimension(product.tileWidthMeters, product.id, 'tileWidthMeters')
    * requiredDimension(product.tileHeightMeters, product.id, 'tileHeightMeters');
  const line = basicLine(id, description, estimate.requiredAreaM2 / tileArea, estimate.estimatedUnits, product, productId);
  line.waste = {
    unit: 'm2',
    required: estimate.requiredAreaM2,
    purchased: estimate.purchasedAreaM2,
    waste: Math.max(0, estimate.purchasedAreaM2 - estimate.requiredAreaM2),
    utilizationPercent: estimate.purchasedAreaM2 > 0 ? estimate.requiredAreaM2 / estimate.purchasedAreaM2 * 100 : 100,
  };
  return line;
}

function basicLine(
  id: string,
  description: string,
  requiredQuantity: number,
  purchaseQuantity: number,
  product: ConstructionProduct,
  productId: ConstructionProductId = product.id,
): ConstructionBudgetLine {
  return {
    id,
    productId,
    description,
    unit: product.unit,
    requiredQuantity: round(requiredQuantity),
    purchaseQuantity: round(purchaseQuantity),
    quantity: round(purchaseQuantity),
    unitPriceClp: product.unitPriceClp,
    subtotalClp: Math.round(purchaseQuantity * product.unitPriceClp),
    isDemoPrice: product.isDemoPrice,
    priceSource: product.priceSource,
  };
}

function requiredDimension(value: number | undefined, productId: string, field: string): number {
  if (!(typeof value === 'number' && value > 0)) throw new Error(`Product ${productId} has no valid ${field}`);
  return value;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
