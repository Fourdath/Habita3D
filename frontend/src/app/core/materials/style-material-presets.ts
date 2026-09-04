import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { StyleMaterialPreset } from './material.types';

export const STYLE_MATERIAL_PRESETS: Record<InteriorStyleId, StyleMaterialPreset> = {
  none: { styleId: 'none', dryWall: 'DEFAULT_WALL_NEUTRAL', dryFloor: 'DEFAULT_FLOOR_NEUTRAL', bathroomWall: 'DEFAULT_WALL_NEUTRAL', bathroomFloor: 'DEFAULT_FLOOR_NEUTRAL', kitchenBacksplash: 'MATERIAL_NOT_CONFIGURED', kitchenCabinet: 'FIXTURE_CABINET_NEUTRAL', countertop: 'MATERIAL_NOT_CONFIGURED', exterior: 'DEFAULT_EXTERIOR_NEUTRAL', ceiling: 'CEILING_WHITE', baseboard: 'BASEBOARD_WHITE', door: 'DOOR_WHITE', frame: 'FRAME_WHITE' },
  nordic: { styleId: 'nordic', dryWall: 'NORDIC_WALL_PASTEL_BLUE', dryFloor: 'NORDIC_FLOOR_WOOD_LIGHT', bathroomWall: 'NORDIC_BATH_WALL_TILE_LIGHT', bathroomFloor: 'NORDIC_BATH_FLOOR_TILE_LIGHT', kitchenBacksplash: 'NORDIC_KITCHEN_BACKSPLASH_LIGHT', kitchenCabinet: 'NORDIC_KITCHEN_CABINET_WHITE_WOOD', countertop: 'NORDIC_COUNTERTOP_LIGHT', exterior: 'NORDIC_EXTERIOR_LIGHT', ceiling: 'CEILING_WHITE', baseboard: 'BASEBOARD_WHITE', door: 'DOOR_WHITE', frame: 'FRAME_WHITE' },
  industrial: { styleId: 'industrial', dryWall: 'INDUSTRIAL_WALL_CREAM', dryFloor: 'INDUSTRIAL_FLOOR_WOOD_DARK', bathroomWall: 'INDUSTRIAL_BATH_WALL_TILE_GRAY', bathroomFloor: 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY', kitchenBacksplash: 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY', kitchenCabinet: 'FIXTURE_CABINET_NEUTRAL', countertop: 'MATERIAL_NOT_CONFIGURED', exterior: 'DEFAULT_EXTERIOR_NEUTRAL', ceiling: 'CEILING_WHITE', baseboard: 'BASEBOARD_DARK', door: 'DOOR_DARK', frame: 'FRAME_BLACK' },
};

export function getStyleMaterialPreset(styleId: InteriorStyleId): StyleMaterialPreset {
  return STYLE_MATERIAL_PRESETS[styleId];
}
