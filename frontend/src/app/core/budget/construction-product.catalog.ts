import type { ConstructionProduct, ConstructionProductId } from './construction-product.types';
import type { InteriorStyleId } from '../interior-style/interior-style.types';

/**
 * Demo prices only, deliberately all in one table: replacing them with a real supplier
 * feed must not touch the take-off algorithms.
 */
export const CONSTRUCTION_PRODUCT_CATALOG: Record<ConstructionProductId, ConstructionProduct> = {
  GYPSUM_BOARD_ST_12_5: { id: 'GYPSUM_BOARD_ST_12_5', name: 'Plancha yeso-cartón ST 12,5 mm', category: 'Tabiquería', unit: 'plancha', widthMeters: 1.2, heightMeters: 2.4, thicknessMeters: 0.0125, unitPriceClp: 14990, isDemoPrice: true, priceSource: 'demo' },
  GYPSUM_BOARD_RH_12_5: { id: 'GYPSUM_BOARD_RH_12_5', name: 'Plancha yeso-cartón RH 12,5 mm', category: 'Tabiquería', unit: 'plancha', widthMeters: 1.2, heightMeters: 2.4, thicknessMeters: 0.0125, unitPriceClp: 21990, isDemoPrice: true, priceSource: 'demo' },
  EXTERIOR_FIBERCEMENT_BOARD: { id: 'EXTERIOR_FIBERCEMENT_BOARD', name: 'Plancha fibrocemento exterior 8 mm', category: 'Exterior', unit: 'plancha', widthMeters: 1.2, heightMeters: 2.4, thicknessMeters: 0.008, unitPriceClp: 24990, isDemoPrice: true, priceSource: 'demo' },
  BASEBOARD_WHITE: { id: 'BASEBOARD_WHITE', name: 'Guardapolvo blanco 2,40 m', category: 'Terminaciones', unit: 'tira', lengthMeters: 2.4, unitPriceClp: 6990, isDemoPrice: true, priceSource: 'demo' },
  BASEBOARD_DARK: { id: 'BASEBOARD_DARK', name: 'Guardapolvo oscuro 2,40 m', category: 'Terminaciones', unit: 'tira', lengthMeters: 2.4, unitPriceClp: 8990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_NORDIC_WALL: { id: 'CERAMIC_NORDIC_WALL', name: 'Cerámica muro 30 × 60 (nórdico)', category: 'Revestimientos', unit: 'caja', tileWidthMeters: 0.3, tileHeightMeters: 0.6, tilesPerBox: 8, wasteFactor: 1.1, unitPriceClp: 12990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_NORDIC_FLOOR: { id: 'CERAMIC_NORDIC_FLOOR', name: 'Cerámica piso 60 × 60 (nórdico)', category: 'Revestimientos', unit: 'caja', tileWidthMeters: 0.6, tileHeightMeters: 0.6, tilesPerBox: 4, wasteFactor: 1.1, unitPriceClp: 18990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_INDUSTRIAL_WALL: { id: 'CERAMIC_INDUSTRIAL_WALL', name: 'Cerámica muro 30 × 60 (industrial)', category: 'Revestimientos', unit: 'caja', tileWidthMeters: 0.3, tileHeightMeters: 0.6, tilesPerBox: 8, wasteFactor: 1.1, unitPriceClp: 14990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_INDUSTRIAL_FLOOR: { id: 'CERAMIC_INDUSTRIAL_FLOOR', name: 'Cerámica piso 60 × 60 (industrial)', category: 'Revestimientos', unit: 'caja', tileWidthMeters: 0.6, tileHeightMeters: 0.6, tilesPerBox: 4, wasteFactor: 1.1, unitPriceClp: 21990, isDemoPrice: true, priceSource: 'demo' },
  CONCRETE_M3: { id: 'CONCRETE_M3', name: 'Hormigón in situ (volumen aproximado)', category: 'Obra gruesa', unit: 'm3', unitPriceClp: 125000, isDemoPrice: true, priceSource: 'demo' },
};

export interface StyleProductMap {
  baseboard: ConstructionProductId;
  ceramicWall: ConstructionProductId | null;
  ceramicFloor: ConstructionProductId | null;
}

/** Table only, no logic: which purchasable product each style's finishes map to. */
export const STYLE_PRODUCT_MAP: Record<InteriorStyleId, StyleProductMap> = {
  none: { baseboard: 'BASEBOARD_WHITE', ceramicWall: null, ceramicFloor: null },
  nordic: { baseboard: 'BASEBOARD_WHITE', ceramicWall: 'CERAMIC_NORDIC_WALL', ceramicFloor: 'CERAMIC_NORDIC_FLOOR' },
  industrial: { baseboard: 'BASEBOARD_DARK', ceramicWall: 'CERAMIC_INDUSTRIAL_WALL', ceramicFloor: 'CERAMIC_INDUSTRIAL_FLOOR' },
};

export const getStyleProductMap = (styleId: InteriorStyleId): StyleProductMap =>
  STYLE_PRODUCT_MAP[styleId] ?? STYLE_PRODUCT_MAP.none;
