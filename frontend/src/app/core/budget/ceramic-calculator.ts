import type { ConstructionProduct } from './construction-product.types';

export interface CeramicEstimate {
  requiredAreaM2: number;
  purchasedAreaM2: number;
  estimatedUnits: number;
  wasteFactor: number;
}

export function calculateCeramic(areaM2: number, product: ConstructionProduct): CeramicEstimate {
  const unitArea = (product.tileWidthMeters ?? 0) * (product.tileHeightMeters ?? 0);
  if (!(unitArea > 0)) throw new Error(`Product ${product.id} has no ceramic tile dimensions`);
  const wasteFactor = product.wasteFactor ?? 1;
  const estimatedUnits = Math.ceil(Math.max(0, areaM2) * wasteFactor / unitArea);
  return { requiredAreaM2: Math.max(0, areaM2), purchasedAreaM2: estimatedUnits * unitArea, estimatedUnits, wasteFactor };
}
