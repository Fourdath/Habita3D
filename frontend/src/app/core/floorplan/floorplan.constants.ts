/**
 * Temporary demo plan: CubiCasa5K "high_quality_17", copied locally (not fetched from
 * a remote CubiCasa5K dataset at runtime). Its scale was supplied along with the file.
 */
export const FLOORPLAN_URL = 'assets/floorplans/model.svg';
export const FLOORPLAN_SCALE_METERS_PER_UNIT = 0.01;

/**
 * CubiCasa5K SVGs only carry 2D floor-plan geometry, so door/window heights and sill
 * height have no source in the data. These match the values used by Floorplan2Walkthru
 * (https://github.com/Teetertater/Floorplan2Walkthru) for the same SVG schema.
 */
export const DEFAULT_DOOR_HEIGHT = 2.0;
export const DEFAULT_WINDOW_HEIGHT = 1.0;
export const DEFAULT_WINDOW_SILL_HEIGHT = 0.8;

/** Clamp for degenerate/mis-measured openings. */
export const MIN_DOOR_WIDTH = 0.7;
export const MIN_WINDOW_WIDTH = 0.4;

/**
 * Wall-thickness fallbacks, used only when a wall's own SVG-derived thickness falls
 * outside WALL_THICKNESS_SANITY_MIN_M/MAX_M (i.e. the polygon is missing, degenerate,
 * or otherwise unusable) — a valid measurement from the SVG always takes priority.
 *
 * These are visual stand-ins, not a construction certification: Chile's MINVU "Listado
 * Oficial de Comportamiento al Fuego" (ED17-2025) confirms there is no single mandatory
 * wall thickness — it depends on the construction system used. 100mm is representative
 * of a typical interior drywall partition (e.g. Volcán's "i120 SCV24" 100mm system);
 * 150mm is representative of a typical exterior/load-bearing wall.
 */
export const DEFAULT_INTERIOR_WALL_THICKNESS_M = 0.1;
export const DEFAULT_EXTERIOR_WALL_THICKNESS_M = 0.15;
export const DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M = 0.12;
export const WALL_THICKNESS_SANITY_MIN_M = 0.06;
export const WALL_THICKNESS_SANITY_MAX_M = 0.25;
