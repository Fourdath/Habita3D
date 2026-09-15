import type { InteriorStyleId } from '../interior-style/interior-style.types';
import { isCeramicFinish } from '../materials/material.catalog';
import { getStyleMaterialPreset } from '../materials/style-material-presets';
import { calculateCeramicBoxes } from './ceramic-calculator';
import { CONSTRUCTION_PRODUCT_CATALOG, getStyleProductMap } from './construction-product.catalog';
import type { ConstructionProduct, ConstructionProductId } from './construction-product.types';
import type { BudgetWaste, ConstructionBudgetLine, ConstructionBudgetSummary } from './budget.types';
import { packLinear, splitLinear } from './linear-cut-optimizer';
import type { LinearCutOptimization } from './linear-cut-optimizer';
import { packSheets, splitForStock } from './sheet-cut-optimizer';
import type { SheetCutOptimization } from './sheet-cut-optimizer';
import type { ManifestWallFace, SurfaceManifest } from './surface-manifest.types';

type SheetProductId = 'GYPSUM_BOARD_ST_12_5' | 'GYPSUM_BOARD_RH_12_5' | 'EXTERIOR_FIBERCEMENT_BOARD';

interface LineInput {
  requiredQuantity: number;
  purchaseQuantity: number;
  detail?: string;
  waste?: { unit: BudgetWaste['unit']; required: number; purchased: number };
  optimizationSummary?: LinearCutOptimization | SheetCutOptimization;
}

/**
 * Take-off over the surface manifest produced by the geometry builder.
 *
 * Two rules keep it honest: a quantity exists only if the corresponding surface was
 * actually built, and a ceramic line appears only if the active style really assigns a
 * ceramic finish to that role (so 'Sin estilo' quotes no tile at all).
 */
export function computeConstructionBudget(
  manifest: SurfaceManifest, styleId: InteriorStyleId,
): ConstructionBudgetSummary {
  const products = getStyleProductMap(styleId);
  const preset = getStyleMaterialPreset(styleId);
  const items: ConstructionBudgetLine[] = [];

  // Sheets: one demand per FACE, with the product the neighbouring room requires.
  const sheetDemand: Record<SheetProductId, ManifestWallFace[]> = {
    GYPSUM_BOARD_ST_12_5: [],
    GYPSUM_BOARD_RH_12_5: [],
    EXTERIOR_FIBERCEMENT_BOARD: [],
  };
  for (const face of manifest.wallFaces) {
    const productId = sheetProductForFace(face);
    if (!productId) continue;
    sheetDemand[productId].push(face);
  }

  for (const productId of Object.keys(sheetDemand) as SheetProductId[]) {
    const faces = sheetDemand[productId];
    if (faces.length === 0) continue;
    const product = CONSTRUCTION_PRODUCT_CATALOG[productId];
    const stockWidth = product.widthMeters ?? 1.2;
    const stockHeight = product.heightMeters ?? 2.4;
    const pieces = faces.flatMap((face, faceIndex) => face.rects.flatMap((rect, rectIndex) =>
      splitForStock(rect, stockWidth, stockHeight, `${face.wallId}_${face.side}_${faceIndex}_${rectIndex}`)));
    const packed = packSheets(stockWidth, stockHeight, pieces);

    items.push(buildLine(productId, product.name, product, {
      requiredQuantity: packed.requiredAreaM2 / (stockWidth * stockHeight),
      purchaseQuantity: packed.sheetsUsed,
      detail: `${faces.length} caras · ${packed.requiredAreaM2.toFixed(1)} m² netos`,
      waste: { unit: 'm2', required: packed.requiredAreaM2, purchased: packed.purchasedAreaM2 },
      optimizationSummary: packed,
    }));
  }

  // Ceramic, only where the style's finish for that role is actually ceramic.
  if (products.ceramicWall && isCeramicFinish(preset.bathroomWainscot)) {
    const wainscotArea = manifest.wallFaces.reduce((sum, face) => sum + face.wainscotAreaM2, 0);
    if (wainscotArea > 0) {
      items.push(ceramicLine(products.ceramicWall, 'Cerámica revestimiento de baño (hasta 2,10 m)', wainscotArea));
    }
  }
  if (products.ceramicWall && isCeramicFinish(preset.kitchenBacksplash)) {
    const backsplashArea = manifest.backsplash.reduce((sum, run) => sum + run.areaM2, 0);
    if (backsplashArea > 0) {
      items.push(ceramicLine(products.ceramicWall, 'Cerámica backsplash de cocina (tramo del mesón)', backsplashArea, '_backsplash'));
    }
  }
  if (products.ceramicFloor && isCeramicFinish(preset.bathroomFloor)) {
    const bathroomFloorArea = manifest.floors
      .filter((floor) => floor.semantic === 'BATHROOM')
      .reduce((sum, floor) => sum + floor.areaM2, 0);
    if (bathroomFloorArea > 0) {
      items.push(ceramicLine(products.ceramicFloor, 'Cerámica piso de baño', bathroomFloorArea));
    }
  }

  // Baseboard.
  const baseboardLengths = manifest.baseboards.map((segment) => segment.lengthM);
  if (baseboardLengths.length > 0) {
    const product = CONSTRUCTION_PRODUCT_CATALOG[products.baseboard];
    const stockLength = product.lengthMeters ?? 2.4;
    const cuts = baseboardLengths.flatMap((length) => splitLinear(length, stockLength));
    const packed = packLinear(stockLength, cuts);
    items.push(buildLine(products.baseboard, product.name, product, {
      requiredQuantity: packed.requiredLengthM / stockLength,
      purchaseQuantity: packed.stockPiecesUsed,
      detail: `${baseboardLengths.length} tramos · ${packed.requiredLengthM.toFixed(1)} m`,
      waste: { unit: 'm', required: packed.requiredLengthM, purchased: packed.purchasedLengthM },
      optimizationSummary: packed,
    }));
  }

  // Concrete, where the inferred assembly demands it.
  const concreteVolume = manifest.concrete.reduce((sum, wall) => sum + wall.volumeM3, 0);
  if (concreteVolume > 0) {
    const product = CONSTRUCTION_PRODUCT_CATALOG.CONCRETE_M3;
    items.push(buildLine('CONCRETE_M3', product.name, product, {
      requiredQuantity: concreteVolume,
      purchaseQuantity: Math.ceil(concreteVolume * 10) / 10,
      detail: `${manifest.concrete.length} muros de hormigón inferidos por espesor`,
    }));
  }

  return {
    styleId,
    isDemoPricing: true,
    items,
    totalClp: items.reduce((sum, item) => sum + item.subtotalClp, 0),
    requiresStructuralSpecification: manifest.concrete.length > 0,
  };
}

/**
 * Which sheet a face needs. Moisture-resistant board goes ONLY on the face looking into
 * the wet room — the other face of that same wall is standard board.
 */
function sheetProductForFace(face: ManifestWallFace): SheetProductId | null {
  if (face.assemblyId !== 'INTERIOR_LIGHT' && face.assemblyId !== 'EXTERIOR_LIGHT') return null;
  if (face.environment === 'EXTERIOR') {
    return face.assemblyId === 'EXTERIOR_LIGHT' ? 'EXTERIOR_FIBERCEMENT_BOARD' : null;
  }
  if (face.environment !== 'INTERIOR') return null;
  return face.roomSemantic === 'BATHROOM' ? 'GYPSUM_BOARD_RH_12_5' : 'GYPSUM_BOARD_ST_12_5';
}

function ceramicLine(
  productId: ConstructionProductId, description: string, areaM2: number, suffix = '',
): ConstructionBudgetLine {
  const product = CONSTRUCTION_PRODUCT_CATALOG[productId];
  const takeOff = calculateCeramicBoxes(product, areaM2);
  return buildLine(productId, description, product, {
    requiredQuantity: takeOff.boxAreaM2 > 0 ? areaM2 / takeOff.boxAreaM2 : 0,
    purchaseQuantity: takeOff.boxes,
    detail: `${areaM2.toFixed(1)} m² · pérdida ${Math.round((takeOff.wasteFactor - 1) * 100)}%`,
    waste: { unit: 'm2', required: areaM2, purchased: takeOff.purchasedAreaM2 },
  }, suffix);
}

function buildLine(
  productId: ConstructionProductId, description: string, product: ConstructionProduct,
  input: LineInput, idSuffix = '',
): ConstructionBudgetLine {
  const purchase = round(input.purchaseQuantity);
  const line: ConstructionBudgetLine = {
    id: productId + idSuffix,
    productId: product.id,
    description,
    category: product.category,
    unit: product.unit,
    requiredQuantity: round(input.requiredQuantity),
    purchaseQuantity: purchase,
    quantity: purchase,
    unitPriceClp: product.unitPriceClp,
    subtotalClp: Math.round(purchase * product.unitPriceClp),
    isDemoPrice: true,
    priceSource: 'demo',
    detail: input.detail,
    optimizationSummary: input.optimizationSummary,
  };
  if (input.waste) {
    line.waste = {
      unit: input.waste.unit,
      required: round(input.waste.required),
      purchased: round(input.waste.purchased),
      waste: round(Math.max(0, input.waste.purchased - input.waste.required)),
      utilizationPercent: input.waste.purchased > 0
        ? round((input.waste.required / input.waste.purchased) * 100)
        : 100,
    };
  }
  return line;
}

const round = (value: number): number => Number(value.toFixed(3));

export const formatClp = (amount: number): string => new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
}).format(amount);
