export type ConstructionProductId =
  | 'GYPSUM_BOARD_ST_12_5'
  | 'GYPSUM_BOARD_RH_12_5'
  | 'EXTERIOR_FIBERCEMENT_BOARD'
  | 'BASEBOARD_WHITE'
  | 'BASEBOARD_DARK'
  | 'CERAMIC_NORDIC_WALL'
  | 'CERAMIC_NORDIC_FLOOR'
  | 'CERAMIC_INDUSTRIAL_WALL'
  | 'CERAMIC_INDUSTRIAL_FLOOR'
  | 'CONCRETE_M3';

/** How the product is actually sold in Chile — the unit the purchase quantity counts. */
export type ConstructionProductUnit = 'plancha' | 'tira' | 'caja' | 'm3';

export interface ConstructionProduct {
  id: ConstructionProductId;
  name: string;
  category: string;
  unit: ConstructionProductUnit;
  widthMeters?: number;
  heightMeters?: number;
  lengthMeters?: number;
  thicknessMeters?: number;
  tileWidthMeters?: number;
  tileHeightMeters?: number;
  tilesPerBox?: number;
  wasteFactor?: number;
  unitPriceClp: number;
  isDemoPrice: true;
  priceSource: 'demo';
}
