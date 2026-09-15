import type { ConstructionProduct } from './construction-product.types';

export interface CeramicTakeOff {
  areaM2: number;
  boxAreaM2: number;
  boxes: number;
  purchasedAreaM2: number;
  wasteFactor: number;
}

/**
 * Boxes of tile for a finished area, including the catalog's cutting-loss factor.
 * Tile is sold by the box, so the purchase is always rounded up.
 */
export function calculateCeramicBoxes(product: ConstructionProduct, areaM2: number): CeramicTakeOff {
  const tileArea = (product.tileWidthMeters ?? 0) * (product.tileHeightMeters ?? 0);
  const boxArea = tileArea * (product.tilesPerBox ?? 1);
  const wasteFactor = product.wasteFactor ?? 1;
  if (boxArea <= 0) {
    return { areaM2, boxAreaM2: 0, boxes: 0, purchasedAreaM2: 0, wasteFactor };
  }
  const boxes = Math.ceil((areaM2 * wasteFactor) / boxArea);
  return { areaM2, boxAreaM2: boxArea, boxes, purchasedAreaM2: boxes * boxArea, wasteFactor };
}
