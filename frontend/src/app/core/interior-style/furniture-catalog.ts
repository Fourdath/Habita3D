import type { FurnitureCatalogEntry, FurnitureCategory, InteriorStyleId } from './interior-style.types';

/**
 * Ten curated CC0 low-poly models — one per (category, style) pair — downloaded once
 * from poly.pizza and committed under public/assets/furniture/. See
 * public/assets/ASSETS.md for exact source URLs/licenses. Both packs (Quaternius'
 * "Ultimate House Interior Pack" for nordic, Kenney's "Furniture Kit" for industrial)
 * are modeled at real-world meter scale, so `scale` starts at 1 for all entries —
 * adjusted per-entry only where visual verification showed it was off.
 */
export const FURNITURE_CATALOG: FurnitureCatalogEntry[] = [
  {
    id: 'nordic-sofa',
    category: 'sofa',
    style: 'nordic',
    modelPath: 'assets/furniture/nordic/sofa.glb',
    dimensionsMeters: { width: 1.6, depth: 0.8, height: 0.8 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 349990,
  },
  {
    id: 'nordic-table',
    category: 'table',
    style: 'nordic',
    modelPath: 'assets/furniture/nordic/table.glb',
    dimensionsMeters: { width: 1.0, depth: 1.0, height: 0.75 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 129990,
  },
  {
    id: 'nordic-chair',
    category: 'chair',
    style: 'nordic',
    modelPath: 'assets/furniture/nordic/chair.glb',
    dimensionsMeters: { width: 0.5, depth: 0.5, height: 0.9 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 39990,
  },
  {
    id: 'nordic-bed',
    category: 'bed',
    style: 'nordic',
    modelPath: 'assets/furniture/nordic/bed.glb',
    dimensionsMeters: { width: 1.0, depth: 2.0, height: 0.6 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 249990,
  },
  {
    id: 'nordic-nightstand',
    category: 'nightstand',
    style: 'nordic',
    modelPath: 'assets/furniture/nordic/nightstand.glb',
    dimensionsMeters: { width: 0.4, depth: 0.4, height: 0.5 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 34990,
  },
  {
    id: 'industrial-sofa',
    category: 'sofa',
    style: 'industrial',
    modelPath: 'assets/furniture/industrial/sofa.glb',
    dimensionsMeters: { width: 1.6, depth: 0.85, height: 0.8 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 389990,
  },
  {
    id: 'industrial-table',
    category: 'table',
    style: 'industrial',
    modelPath: 'assets/furniture/industrial/table.glb',
    dimensionsMeters: { width: 1.1, depth: 0.7, height: 0.75 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 149990,
  },
  {
    id: 'industrial-chair',
    category: 'chair',
    style: 'industrial',
    modelPath: 'assets/furniture/industrial/chair.glb',
    dimensionsMeters: { width: 0.5, depth: 0.5, height: 0.9 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 44990,
  },
  {
    id: 'industrial-bed',
    category: 'bed',
    style: 'industrial',
    modelPath: 'assets/furniture/industrial/bed.glb',
    dimensionsMeters: { width: 1.5, depth: 2.0, height: 0.6 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 279990,
  },
  {
    id: 'industrial-nightstand',
    category: 'nightstand',
    style: 'industrial',
    modelPath: 'assets/furniture/industrial/nightstand.glb',
    dimensionsMeters: { width: 0.4, depth: 0.4, height: 0.5 },
    scale: 1,
    baseRotationY: 0,
    priceClp: 39990,
  },
];

export function findFurnitureCatalogEntry(
  category: FurnitureCategory,
  style: Exclude<InteriorStyleId, 'none'>,
): FurnitureCatalogEntry | undefined {
  return FURNITURE_CATALOG.find((entry) => entry.category === category && entry.style === style);
}
