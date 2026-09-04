import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { RoomSemanticType } from '../floorplan/room-semantic.types';
import { getStyleMaterialPreset } from './style-material-presets';
import type { MaterialId, WallSurfaceContext } from './material.types';

export function resolveWallSurfaceMaterial(context: WallSurfaceContext): MaterialId {
  const override = context.overrides?.find((candidate) => candidate.wallId === context.wallId && candidate.side === context.side);
  if (override) return override.materialId;
  const preset = getStyleMaterialPreset(context.styleId);
  if (context.environment === 'EXTERIOR') return preset.exterior;
  if (context.environment === 'UNKNOWN') return 'MATERIAL_NOT_CONFIGURED';
  return context.roomSemantic === 'BATHROOM' ? preset.bathroomWall : preset.dryWall;
}

export function resolveRoomFloorMaterial(styleId: InteriorStyleId, roomSemantic: RoomSemanticType): MaterialId {
  const preset = getStyleMaterialPreset(styleId);
  if (roomSemantic === 'UNKNOWN') return 'MATERIAL_NOT_CONFIGURED';
  return roomSemantic === 'BATHROOM' ? preset.bathroomFloor : preset.dryFloor;
}

export function resolveRoomCeilingMaterial(styleId: InteriorStyleId): MaterialId {
  return getStyleMaterialPreset(styleId).ceiling;
}
