import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { RoomSemanticType } from '../floorplan/room-semantic.types';
import type { WallSideEnvironment, WallSideName } from '../construction/wall-assembly.types';

export type MaterialStatus = 'READY' | 'PENDING_ASSET' | 'NOT_CONFIGURED';
export type MaterialProvider = 'polyhaven' | 'procedural' | 'local';

export type MaterialId =
  | 'MATERIAL_NOT_CONFIGURED'
  | 'DEFAULT_WALL_NEUTRAL'
  | 'DEFAULT_FLOOR_NEUTRAL'
  | 'DEFAULT_EXTERIOR_NEUTRAL'
  | 'NORDIC_WALL_PASTEL_BLUE'
  | 'NORDIC_FLOOR_WOOD_LIGHT'
  | 'NORDIC_BATH_WALL_TILE_LIGHT'
  | 'NORDIC_BATH_FLOOR_TILE_LIGHT'
  | 'NORDIC_KITCHEN_BACKSPLASH_LIGHT'
  | 'NORDIC_KITCHEN_CABINET_WHITE_WOOD'
  | 'NORDIC_COUNTERTOP_LIGHT'
  | 'NORDIC_EXTERIOR_LIGHT'
  | 'INDUSTRIAL_WALL_CREAM'
  | 'INDUSTRIAL_FLOOR_WOOD_DARK'
  | 'INDUSTRIAL_WALL_BRICK_EXPOSED'
  | 'INDUSTRIAL_WALL_CONCRETE_VISIBLE'
  | 'INDUSTRIAL_BATH_WALL_TILE_GRAY'
  | 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY'
  | 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY'
  | 'CEILING_WHITE'
  | 'BASEBOARD_WHITE'
  | 'BASEBOARD_DARK'
  | 'DOOR_WHITE'
  | 'DOOR_DARK'
  | 'FRAME_WHITE'
  | 'FRAME_BLACK'
  | 'WINDOW_GLASS'
  | 'LIGHT_FIXTURE'
  | 'FIXTURE_CERAMIC_WHITE'
  | 'FIXTURE_METAL_DARK'
  | 'FIXTURE_GLASS'
  | 'FIXTURE_CABINET_NEUTRAL'
  | 'FIXTURE_APPLIANCE'
  | 'TERRAIN_GRASS';

export interface MaterialTextureMaps {
  albedo: string;
  normalGl?: string;
  roughness?: string;
  ao?: string;
  metalness?: string;
}

export interface MaterialDefinition {
  id: MaterialId;
  provider: MaterialProvider;
  assetSlug?: string;
  assetName?: string;
  license?: 'CC0' | 'internal';
  physicalWidthMeters?: number;
  physicalHeightMeters?: number;
  maps?: MaterialTextureMaps;
  baseColor?: number;
  roughness: number;
  metalness: number;
  normalScale?: number;
  opacity?: number;
  transparent?: boolean;
  clearcoat?: number;
  clearcoatRoughness?: number;
  status: MaterialStatus;
}

export interface StyleMaterialPreset {
  styleId: InteriorStyleId;
  dryWall: MaterialId;
  dryFloor: MaterialId;
  bathroomWall: MaterialId;
  bathroomFloor: MaterialId;
  kitchenBacksplash: MaterialId;
  kitchenCabinet: MaterialId;
  countertop: MaterialId;
  exterior: MaterialId;
  ceiling: MaterialId;
  baseboard: MaterialId;
  door: MaterialId;
  frame: MaterialId;
}

export interface WallSurfaceOverride {
  wallId: string;
  side: WallSideName;
  materialId: MaterialId;
}

export interface WallSurfaceContext {
  styleId: InteriorStyleId;
  wallId: string;
  side: WallSideName;
  environment: WallSideEnvironment;
  roomSemantic: RoomSemanticType;
  overrides?: readonly WallSurfaceOverride[];
}
