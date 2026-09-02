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
