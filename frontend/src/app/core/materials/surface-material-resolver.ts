import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { RoomSemanticType } from '../floorplan/room-semantic.types';
import type { MaterialId, SurfaceUserData, WallSurfaceContext } from './material.types';
import { getStyleMaterialPreset } from './style-material-presets';

export function resolveRoomFloorFinish(styleId: InteriorStyleId, roomSemantic: RoomSemanticType): MaterialId {
  const preset = getStyleMaterialPreset(styleId);
  return roomSemantic === 'BATHROOM' ? preset.bathroomFloor : preset.dryFloor;
}

export const resolveRoomCeilingFinish = (styleId: InteriorStyleId): MaterialId =>
  getStyleMaterialPreset(styleId).ceiling;

/**
 * Resolves the finish of ONE surface from its role. Geometry is built once and tagged,
 * so switching style is a material swap; the 2.10 m wainscot cut depends on the room's
 * semantics, not on the style, and therefore survives the swap.
 */
export function resolveFinishByRole(styleId: InteriorStyleId, userData: SurfaceUserData): MaterialId {
  const preset = getStyleMaterialPreset(styleId);
  switch (userData.finishRole) {
    case 'EXTERIOR': return preset.exterior;
    case 'BATHROOM_WAINSCOT': return preset.bathroomWainscot;
    case 'BATHROOM_ABOVE': return preset.bathroomWallAbove;
    case 'DRY_WALL': {
      const rule = preset.accentRule;
      if (rule && userData.accentKind === 'BRICK' && rule.brickAccentMaterialId) {
        return rule.brickAccentMaterialId;
      }
      if (rule && userData.accentKind === 'CONCRETE' && rule.concreteOnInferredConcrete && rule.concreteMaterialId) {
        return rule.concreteMaterialId;
      }
      return preset.dryWall;
    }
    case 'FLOOR_BATH': return preset.bathroomFloor;
    case 'FLOOR_DRY': return preset.dryFloor;
    case 'CEILING': return preset.ceiling;
    case 'BASEBOARD': return preset.baseboard;
    case 'DOOR': return preset.door;
    case 'FRAME': return preset.frame;
    case 'BACKSPLASH': return preset.kitchenBacksplash;
    case 'CABINET': return preset.kitchenCabinet;
    case 'COUNTERTOP': return preset.countertop;
    case 'TOE_KICK': return preset.toeKick;
    default: return userData.materialId ?? 'DEFAULT_WALL_NEUTRAL';
  }
}

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
