import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { StyleMaterialPreset } from './material.types';

/** Ceramic wainscot height in bathrooms: tile below, paint above. */
export const WAINSCOT_TOP_M = 2.1;

export const STYLE_MATERIAL_PRESETS: Record<InteriorStyleId, StyleMaterialPreset> = {
  none: {
    styleId: 'none',
    label: 'Sin estilo',
    dryWall: 'DEFAULT_WALL_NEUTRAL',
    dryFloor: 'DEFAULT_FLOOR_NEUTRAL',
    bathroomWainscot: 'DEFAULT_WALL_NEUTRAL',
    bathroomWallAbove: 'DEFAULT_WALL_NEUTRAL',
    bathroomWall: 'DEFAULT_WALL_NEUTRAL',
    bathroomFloor: 'DEFAULT_FLOOR_NEUTRAL',
    kitchenBacksplash: 'DEFAULT_WALL_NEUTRAL',
    kitchenCabinet: 'DEFAULT_WALL_NEUTRAL',
    toeKick: 'TOE_KICK_DARK',
    countertop: 'DEFAULT_FLOOR_NEUTRAL',
    exterior: 'DEFAULT_EXTERIOR_NEUTRAL',
    ceiling: 'CEILING_WHITE',
    baseboard: 'BASEBOARD_WHITE',
    door: 'DOOR_WHITE',
    frame: 'FRAME_WHITE',
    accentRule: null,
  },
  nordic: {
    styleId: 'nordic',
    label: 'Nórdico',
    dryWall: 'NORDIC_WALL_PASTEL_BLUE',
    dryFloor: 'NORDIC_FLOOR_WOOD_LIGHT',
    bathroomWainscot: 'NORDIC_BATH_WALL_TILE_LIGHT',
    bathroomWallAbove: 'NORDIC_WALL_PASTEL_BLUE',
    bathroomWall: 'NORDIC_BATH_WALL_TILE_LIGHT',
    bathroomFloor: 'NORDIC_BATH_FLOOR_TILE_LIGHT',
    kitchenBacksplash: 'NORDIC_KITCHEN_BACKSPLASH_LIGHT',
    kitchenCabinet: 'NORDIC_KITCHEN_CABINET',
    toeKick: 'TOE_KICK_DARK',
    countertop: 'NORDIC_COUNTERTOP',
    exterior: 'NORDIC_EXTERIOR_LIGHT',
    ceiling: 'CEILING_WHITE',
    baseboard: 'BASEBOARD_WHITE',
    door: 'DOOR_WHITE',
    frame: 'FRAME_WHITE',
    // Light wood, pastel walls, white trim: no exposed masonry anywhere.
    accentRule: null,
  },
  industrial: {
    styleId: 'industrial',
    label: 'Industrial',
    dryWall: 'INDUSTRIAL_WALL_CREAM',
    dryFloor: 'INDUSTRIAL_FLOOR_WOOD_DARK',
    bathroomWainscot: 'INDUSTRIAL_BATH_WALL_TILE_GRAY',
    bathroomWallAbove: 'INDUSTRIAL_WALL_CREAM',
    bathroomWall: 'INDUSTRIAL_BATH_WALL_TILE_GRAY',
    bathroomFloor: 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY',
    kitchenBacksplash: 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY',
    kitchenCabinet: 'INDUSTRIAL_KITCHEN_CABINET',
    toeKick: 'TOE_KICK_DARK',
    countertop: 'INDUSTRIAL_COUNTERTOP',
    exterior: 'INDUSTRIAL_EXTERIOR',
    ceiling: 'CEILING_WHITE',
    baseboard: 'BASEBOARD_DARK',
    door: 'DOOR_DARK',
    frame: 'FRAME_BLACK',
    // Brick and concrete are ACCENT surfaces: one face per room, never the default.
    accentRule: {
      brickAccentMaterialId: 'INDUSTRIAL_WALL_BRICK_EXPOSED',
      concreteMaterialId: 'INDUSTRIAL_WALL_CONCRETE_VISIBLE',
      concreteOnInferredConcrete: true,
    },
  },
};

export const getStyleMaterialPreset = (styleId: InteriorStyleId): StyleMaterialPreset =>
  STYLE_MATERIAL_PRESETS[styleId] ?? STYLE_MATERIAL_PRESETS.none;
