import type { BudgetItem, InteriorStyle, InteriorStyleId } from './interior-style.types';

const NORDIC_BUDGET_ITEMS: BudgetItem[] = [
  { id: 'nordic-floor', name: 'Piso de roble claro', category: 'Piso', unit: 'm2', quantitySource: 'floorAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 18900 },
  { id: 'nordic-interior-wall', name: 'Terminación interior blanco cálido', category: 'Muros interiores', unit: 'm2', quantitySource: 'interiorWallAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 6900 },
  { id: 'nordic-exterior-wall', name: 'Estuco exterior claro', category: 'Fachada', unit: 'm2', quantitySource: 'exteriorWallAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 12900 },
  { id: 'nordic-ceiling', name: 'Terminación de cielo blanco', category: 'Cielo', unit: 'm2', quantitySource: 'ceilingAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 5900 },
  { id: 'nordic-baseboard', name: 'Guardapolvo blanco', category: 'Molduras', unit: 'metro', quantitySource: 'baseboardLengthM', quantity: 1, wasteFactor: 1.05, unitPriceClp: 3990 },
  { id: 'nordic-doors', name: 'Marcos y tapajuntas de puertas', category: 'Puertas', unit: 'unidad', quantitySource: 'doorCount', quantity: 1, unitPriceClp: 32990 },
  { id: 'nordic-windows', name: 'Marcos, junquillos y alféizares', category: 'Ventanas', unit: 'unidad', quantitySource: 'windowCount', quantity: 1, unitPriceClp: 44990 },
  { id: 'nordic-lights', name: 'Plafón cálido de cielo', category: 'Iluminación', unit: 'unidad', quantitySource: 'lightCount', quantity: 1, unitPriceClp: 19990 },
];

const INDUSTRIAL_BUDGET_ITEMS: BudgetItem[] = [
  { id: 'industrial-floor', name: 'Piso laminado oscuro', category: 'Piso', unit: 'm2', quantitySource: 'floorAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 21900 },
  { id: 'industrial-interior-wall', name: 'Terminación interior tipo hormigón', category: 'Muros interiores', unit: 'm2', quantitySource: 'interiorWallAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 9900 },
  { id: 'industrial-exterior-wall', name: 'Revestimiento exterior de ladrillo', category: 'Fachada', unit: 'm2', quantitySource: 'exteriorWallAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 18900 },
  { id: 'industrial-ceiling', name: 'Terminación de cielo gris cálido', category: 'Cielo', unit: 'm2', quantitySource: 'ceilingAreaM2', quantity: 1, wasteFactor: 1.1, unitPriceClp: 6900 },
  { id: 'industrial-baseboard', name: 'Guardapolvo grafito', category: 'Molduras', unit: 'metro', quantitySource: 'baseboardLengthM', quantity: 1, wasteFactor: 1.05, unitPriceClp: 5490 },
  { id: 'industrial-doors', name: 'Marcos y tapajuntas grafito', category: 'Puertas', unit: 'unidad', quantitySource: 'doorCount', quantity: 1, unitPriceClp: 39990 },
  { id: 'industrial-windows', name: 'Marcos metálicos y alféizares', category: 'Ventanas', unit: 'unidad', quantitySource: 'windowCount', quantity: 1, unitPriceClp: 54990 },
  { id: 'industrial-lights', name: 'Plafón negro de luz cálida', category: 'Iluminación', unit: 'unidad', quantitySource: 'lightCount', quantity: 1, unitPriceClp: 24990 },
];

/**
 * Fixed catalog: 'none' (the plain default look already built by floorplan-geometry.ts),
 * 'nordic', and 'industrial'. Palette/texture choices per DESIGN spec: IKEA-style warm
 * Scandinavian for nordic (https://www.ikea.com/us/en/ideas/styles/scandinavian/), and
 * concrete/brick residential-industrial for industrial
 * (https://www.archdaily.com/tag/concrete-interiors).
 */
const INTERIOR_STYLE_CATALOG: Record<InteriorStyleId, InteriorStyle> = {
  none: {
    id: 'none',
    name: 'Sin diseño',
    palette: { primary: 0xe4ded2, secondary: 0xb9ab97, accent: 0x9aa58f },
    interiorWallMaterial: null,
    exteriorWallMaterial: null,
    floorMaterial: null,
    ceilingMaterial: null,
    trimColor: 0xf4f1e9,
    windowFrameColor: 0xe8e4da,
    lighting: null,
    budgetItems: [],
  },
  nordic: {
    id: 'nordic',
    name: 'Nórdico',
    palette: { primary: 0xf3f0e8, secondary: 0xd8cdbe, accent: 0x9aa58f },
    interiorWallMaterial: { texturePath: 'assets/textures/white_stucco', tileMeters: 2, fallbackColor: 0xf3f0e8, roughness: 0.92, normalScale: 0.22 },
    exteriorWallMaterial: { texturePath: 'assets/textures/white_stucco', tileMeters: 1.5, fallbackColor: 0xe7e1d5, roughness: 0.96, normalScale: 0.4 },
    floorMaterial: { texturePath: 'assets/textures/oak_wood_planks', tileMeters: 2, fallbackColor: 0xd8cdbe, roughness: 0.42, normalScale: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.5 },
    ceilingMaterial: { texturePath: 'assets/textures/white_stucco', tileMeters: 2.5, fallbackColor: 0xf7f4ed, roughness: 0.98, normalScale: 0.12 },
    trimColor: 0xf7f5ef,
    windowFrameColor: 0xeae7df,
    lighting: { roomLightColor: 0xffc98f, roomLightIntensity: 32, fixtureColor: 0xf4efe4, fixtureEmissiveIntensity: 1.6 },
    budgetItems: NORDIC_BUDGET_ITEMS,
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial',
    palette: { primary: 0xb2b0aa, secondary: 0x303234, accent: 0x804b38 },
    interiorWallMaterial: { texturePath: 'assets/textures/rough_concrete', tileMeters: 2.5, fallbackColor: 0xb2b0aa, roughness: 0.9, normalScale: 0.35 },
    exteriorWallMaterial: { texturePath: 'assets/textures/brick_wall_003', tileMeters: 2, fallbackColor: 0x8b6350, roughness: 0.92, normalScale: 0.55 },
    floorMaterial: { texturePath: 'assets/textures/laminate_floor_02', tileMeters: 2, fallbackColor: 0x4a4542, roughness: 0.48, normalScale: 0.4, clearcoat: 0.08, clearcoatRoughness: 0.58 },
    ceilingMaterial: { texturePath: 'assets/textures/white_stucco', tileMeters: 2.5, fallbackColor: 0xd8d5cf, roughness: 0.98, normalScale: 0.1 },
    trimColor: 0x34373a,
    windowFrameColor: 0x202326,
    lighting: { roomLightColor: 0xffb86b, roomLightIntensity: 28, fixtureColor: 0x1f2224, fixtureEmissiveIntensity: 1.8 },
    budgetItems: INDUSTRIAL_BUDGET_ITEMS,
  },
};

export function getInteriorStyle(id: InteriorStyleId): InteriorStyle {
  return INTERIOR_STYLE_CATALOG[id];
}

export function listInteriorStyles(): InteriorStyle[] {
  return [INTERIOR_STYLE_CATALOG.none, INTERIOR_STYLE_CATALOG.nordic, INTERIOR_STYLE_CATALOG.industrial];
}
