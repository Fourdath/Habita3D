import type { ConstructionProduct, ConstructionProductId } from './construction-product.types';

export const CONSTRUCTION_PRODUCT_CATALOG: Record<ConstructionProductId, ConstructionProduct> = {
  GYPSUM_BOARD_ST_12_5: { id: 'GYPSUM_BOARD_ST_12_5', name: 'Plancha yeso-cartón ST 12,5 mm', category: 'Drywall', unit: 'piece', widthMeters: 1.2, heightMeters: 2.4, thicknessMeters: 0.0125, unitPriceClp: 14990, isDemoPrice: true, priceSource: 'demo' },
  GYPSUM_BOARD_RH_12_5: { id: 'GYPSUM_BOARD_RH_12_5', name: 'Plancha yeso-cartón RH 12,5 mm', category: 'Drywall', unit: 'piece', widthMeters: 1.2, heightMeters: 2.4, thicknessMeters: 0.0125, unitPriceClp: 21990, isDemoPrice: true, priceSource: 'demo' },
  EXTERIOR_FIBERCEMENT_BOARD: { id: 'EXTERIOR_FIBERCEMENT_BOARD', name: 'Plancha fibrocemento exterior', category: 'Exterior board', unit: 'piece', widthMeters: 1.2, heightMeters: 2.4, unitPriceClp: 24990, isDemoPrice: true, priceSource: 'demo' },
  BASEBOARD_WHITE: { id: 'BASEBOARD_WHITE', name: 'Guardapolvo blanco 2,40 m', category: 'Baseboard', unit: 'piece', lengthMeters: 2.4, unitPriceClp: 6990, isDemoPrice: true, priceSource: 'demo' },
  BASEBOARD_DARK: { id: 'BASEBOARD_DARK', name: 'Guardapolvo oscuro 2,40 m', category: 'Baseboard', unit: 'piece', lengthMeters: 2.4, unitPriceClp: 8990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_NORDIC_WALL: { id: 'CERAMIC_NORDIC_WALL', name: 'Cerámica muro baño nórdico 30 × 60', category: 'Ceramic', unit: 'piece', tileWidthMeters: 0.3, tileHeightMeters: 0.6, wasteFactor: 1.1, unitPriceClp: 2990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_NORDIC_FLOOR: { id: 'CERAMIC_NORDIC_FLOOR', name: 'Cerámica piso baño nórdico 60 × 60', category: 'Ceramic', unit: 'piece', tileWidthMeters: 0.6, tileHeightMeters: 0.6, wasteFactor: 1.1, unitPriceClp: 6990, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_INDUSTRIAL_WALL: { id: 'CERAMIC_INDUSTRIAL_WALL', name: 'Cerámica muro industrial 30 × 60', category: 'Ceramic', unit: 'piece', tileWidthMeters: 0.3, tileHeightMeters: 0.6, wasteFactor: 1.1, unitPriceClp: 3490, isDemoPrice: true, priceSource: 'demo' },
  CERAMIC_INDUSTRIAL_FLOOR: { id: 'CERAMIC_INDUSTRIAL_FLOOR', name: 'Cerámica piso industrial 60 × 60', category: 'Ceramic', unit: 'piece', tileWidthMeters: 0.6, tileHeightMeters: 0.6, wasteFactor: 1.1, unitPriceClp: 7990, isDemoPrice: true, priceSource: 'demo' },
  CONCRETE_M3: { id: 'CONCRETE_M3', name: 'Hormigón (volumen aproximado)', category: 'Concrete', unit: 'm3', unitPriceClp: 125000, isDemoPrice: true, priceSource: 'demo' },
};

export function getConstructionProduct(id: ConstructionProductId): ConstructionProduct {
  return CONSTRUCTION_PRODUCT_CATALOG[id];
}
