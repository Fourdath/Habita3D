/**
 * PBR ground texture: leafy_grass (Poly Haven, CC0, 1K) —
 * https://polyhaven.com/a/leafy_grass — saved locally under
 * frontend/public/assets/textures/leafy_grass/, not fetched at runtime.
 */
export const TERRAIN_TEXTURE_PATH = 'assets/textures/leafy_grass';
/** One texture tile represents this many meters, so it reads at a believable scale. */
export const TERRAIN_TEXTURE_TILE_METERS = 2;
export const TERRAIN_ANISOTROPY = 4;

/** Margin beyond the house's bounding box: max(this, MARGIN_RATIO * longer side). */
export const ENVIRONMENT_MIN_MARGIN_M = 10;
export const ENVIRONMENT_MARGIN_RATIO = 0.5;

/** Thin collidable slab — walkable, but not tall enough to be visually heavy. */
export const TERRAIN_THICKNESS_M = 0.3;
/**
 * How far below the house's own floor slab the terrain's top surface sits. The house
 * floor (FloorplanSceneManager/floorplan-geometry.ts) spans Y ∈ [-FLOORPLAN_FLOOR_THICKNESS, 0];
 * terrain sits fully below that with a real gap so the two surfaces are never coplanar
 * (avoids z-fighting) while staying imperceptible from inside the house.
 */
export const TERRAIN_GAP_BELOW_HOUSE_FLOOR_M = 0.01;

export const SKY_SCALE = 800;
export const SKY_TURBIDITY = 6;
export const SKY_RAYLEIGH = 2;
export const SKY_MIE_COEFFICIENT = 0.005;
export const SKY_MIE_DIRECTIONAL_G = 0.8;
/** Fixed, pleasant sun position — not day/night cycling. */
export const SKY_SUN_ELEVATION_DEG = 35;
export const SKY_SUN_AZIMUTH_DEG = 145;

/** Fog hides the terrain's outer edge; chosen close to the sky's horizon tone for a coherent blend. */
export const FOG_COLOR = 0xbfe0f0;
export const FOG_NEAR_M = 12;
export const FOG_FAR_M = 70;

export const HEMISPHERE_SKY_COLOR = 0x8dc1de;
export const HEMISPHERE_GROUND_COLOR = 0x4d7a3a;
export const HEMISPHERE_INTENSITY = 1.2;
export const SUN_LIGHT_INTENSITY = 2.5;

/** Vegetation: instanced, low-poly, deterministic per floor plan (see vegetation.ts). */
export const VEGETATION_MIN_COUNT = 12;
export const VEGETATION_MAX_COUNT = 30;
/** Trees never spawn closer than this to the house's bounding box. */
export const VEGETATION_SAFETY_MARGIN_M = 2.5;
export const VEGETATION_TRUNK_COLOR = 0x6b4a32;
export const VEGETATION_FOLIAGE_COLOR = 0x3f6b34;
export const VEGETATION_TRUNK_HEIGHT_M = 1.4;
export const VEGETATION_TRUNK_RADIUS_M = 0.12;
export const VEGETATION_FOLIAGE_HEIGHT_M = 2.6;
export const VEGETATION_FOLIAGE_RADIUS_M = 1.1;
export const VEGETATION_SCALE_MIN = 0.8;
export const VEGETATION_SCALE_MAX = 1.3;
