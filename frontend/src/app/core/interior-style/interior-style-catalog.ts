import type { BudgetItem, InteriorStyle, InteriorStyleId } from './interior-style.types';

const NORDIC_BUDGET_ITEMS: BudgetItem[] = [
  { id: 'nordic-floor', name: 'Piso roble claro (oak_wood_planks)', category: 'Piso', unit: 'm2', quantity: 1, unitPriceClp: 18900 },
  { id: 'nordic-paint', name: 'Revestimiento blanco cálido (white_stucco)', category: 'Muro', unit: 'galon', quantity: 4, unitPriceClp: 24990 },
  { id: 'nordic-sofa', name: 'Sofá nórdico', category: 'Mueble', unit: 'unidad', quantity: 1, unitPriceClp: 349990 },
  { id: 'nordic-table', name: 'Mesa nórdica', category: 'Mueble', unit: 'unidad', quantity: 1, unitPriceClp: 129990 },
  { id: 'nordic-chairs', name: 'Sillas nórdicas', category: 'Mueble', unit: 'unidad', quantity: 2, unitPriceClp: 39990 },
  { id: 'nordic-bed', name: 'Cama nórdica', category: 'Mueble', unit: 'unidad', quantity: 1, unitPriceClp: 249990 },
  { id: 'nordic-nightstands', name: 'Veladores nórdicos', category: 'Mueble', unit: 'unidad', quantity: 2, unitPriceClp: 34990 },
];

const INDUSTRIAL_BUDGET_ITEMS: BudgetItem[] = [
  { id: 'industrial-floor', name: 'Piso laminado oscuro (laminate_floor_02)', category: 'Piso', unit: 'm2', quantity: 1, unitPriceClp: 21900 },
  { id: 'industrial-paint', name: 'Revestimiento hormigón (rough_concrete)', category: 'Muro', unit: 'galon', quantity: 4, unitPriceClp: 27990 },
  { id: 'industrial-sofa', name: 'Sofá industrial', category: 'Mueble', unit: 'unidad', quantity: 1, unitPriceClp: 389990 },
  { id: 'industrial-table', name: 'Mesa industrial', category: 'Mueble', unit: 'unidad', quantity: 1, unitPriceClp: 149990 },
  { id: 'industrial-chairs', name: 'Sillas industriales', category: 'Mueble', unit: 'unidad', quantity: 2, unitPriceClp: 44990 },
  { id: 'industrial-bed', name: 'Cama industrial', category: 'Mueble', unit: 'unidad', quantity: 1, unitPriceClp: 279990 },
  { id: 'industrial-nightstands', name: 'Veladores industriales', category: 'Mueble', unit: 'unidad', quantity: 2, unitPriceClp: 39990 },
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
    wallMaterial: null,
    floorMaterial: null,
    lighting: null,
    budgetItems: [],
  },
  nordic: {
    id: 'nordic',
    name: 'Nórdico',
    palette: { primary: 0xf3f0e8, secondary: 0xd8cdbe, accent: 0x9aa58f },
    wallMaterial: { texturePath: 'assets/textures/white_stucco', tileMeters: 2, fallbackColor: 0xf3f0e8 },
    floorMaterial: { texturePath: 'assets/textures/oak_wood_planks', tileMeters: 2, fallbackColor: 0xd8cdbe },
    lighting: { lightColor: 0xfff2e0, hemisphereIntensity: 1.3, directionalIntensity: 2.2 },
    budgetItems: NORDIC_BUDGET_ITEMS,
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial',
    palette: { primary: 0xb2b0aa, secondary: 0x303234, accent: 0x804b38 },
    wallMaterial: { texturePath: 'assets/textures/rough_concrete', tileMeters: 2.5, fallbackColor: 0xb2b0aa },
    floorMaterial: { texturePath: 'assets/textures/laminate_floor_02', tileMeters: 2, fallbackColor: 0x303234 },
    lighting: { lightColor: 0xfff0da, hemisphereIntensity: 1.0, directionalIntensity: 2.6 },
    budgetItems: INDUSTRIAL_BUDGET_ITEMS,
  },
};

export function getInteriorStyle(id: InteriorStyleId): InteriorStyle {
  return INTERIOR_STYLE_CATALOG[id];
}

export function listInteriorStyles(): InteriorStyle[] {
  return [INTERIOR_STYLE_CATALOG.none, INTERIOR_STYLE_CATALOG.nordic, INTERIOR_STYLE_CATALOG.industrial];
}
