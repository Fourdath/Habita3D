/**
 * Domain model for the interior-style prototype: catalog data (styles, materials,
 * furniture, demo pricing) with zero Three.js/Angular dependency, mirroring how
 * core/floorplan/ keeps the CubiCasa domain model separate from its Three.js
 * consumer (features/viewer-3d/engine/floorplan-geometry.ts).
 */

export type InteriorStyleId = 'none' | 'nordic' | 'industrial';

export type FurnitureCategory = 'sofa' | 'table' | 'chair' | 'bed' | 'nightstand';

export interface MaterialSpec {
  /** Base directory of a diffuse/normal/roughness set, e.g. 'assets/textures/oak_wood_planks'. */
  texturePath: string;
  /** How many meters one texture tile represents, for physically-plausible repeat tiling. */
  tileMeters: number;
  /** Shown immediately (and kept if the texture fails to load) so nothing renders untextured/black. */
  fallbackColor: number;
}

export interface InteriorLightingConfig {
  lightColor: number;
  hemisphereIntensity: number;
  directionalIntensity: number;
}

export interface BudgetItem {
  id: string;
  name: string;
  category: string;
  unit: 'unidad' | 'm2' | 'galon';
  quantity: number;
  unitPriceClp: number;
}

export interface InteriorStyle {
  id: InteriorStyleId;
  name: string;
  palette: { primary: number; secondary: number; accent: number };
  /** null for 'none' — keeps the plain default wall/floor material from floorplan-geometry.ts. */
  wallMaterial: MaterialSpec | null;
  floorMaterial: MaterialSpec | null;
  lighting: InteriorLightingConfig | null;
  /** Demonstrative pricing only — see BudgetItem and budget-calculator.ts. Empty for 'none'. */
  budgetItems: BudgetItem[];
}

export interface FurnitureCatalogEntry {
  id: string;
  category: FurnitureCategory;
  style: Exclude<InteriorStyleId, 'none'>;
  /** e.g. 'assets/furniture/nordic/sofa.glb' — loaded via GLTFLoader, cached per URL. */
  modelPath: string;
  /** Approximate real-world footprint, used for simplified box colliders. */
  dimensionsMeters: { width: number; depth: number; height: number };
  /** Uniform scale applied after loading, normalizing the source model to real-world meters. */
  scale: number;
  /** Extra Y rotation (radians) normalizing the source model's forward-facing orientation. */
  baseRotationY: number;
  priceClp: number;
}

/**
 * A furniture slot in the default floor plan's layout, addressed by category + room
 * rather than a specific style's asset id — furniture-layout-builder.ts resolves the
 * actual FurnitureCatalogEntry for (category, currentStyle) at apply time, so the same
 * declared layout works for every style without duplicating positions.
 */
export interface FurniturePlacement {
  category: FurnitureCategory;
  roomId: string;
  /** World-space [x, y, z] meters (y is height above floor — 0 for floor-standing pieces). */
  position: [number, number, number];
  rotationY: number;
  scale?: number;
}
