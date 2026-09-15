import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { RoomSemanticType } from '../floorplan/room-semantic.types';
import type { AccentKind, WallSideEnvironment, WallSideName } from '../construction/wall-assembly.types';

export type MaterialStatus = 'READY' | 'PENDING_ASSET' | 'NOT_CONFIGURED';
export type MaterialProvider = 'polyhaven' | 'procedural' | 'local';

export type MaterialId =
  | 'TERRAIN_GRASS'
  | 'MATERIAL_NOT_CONFIGURED'
  | 'DEFAULT_WALL_NEUTRAL'
  | 'DEFAULT_FLOOR_NEUTRAL'
  | 'DEFAULT_EXTERIOR_NEUTRAL'
  | 'WALL_CORE_STRUCTURE'
  | 'NORDIC_WALL_PASTEL_BLUE'
  | 'NORDIC_FLOOR_WOOD_LIGHT'
  | 'NORDIC_BATH_WALL_TILE_LIGHT'
  | 'NORDIC_BATH_FLOOR_TILE_LIGHT'
  | 'NORDIC_KITCHEN_BACKSPLASH_LIGHT'
  | 'NORDIC_KITCHEN_CABINET'
  | 'NORDIC_COUNTERTOP'
  | 'NORDIC_EXTERIOR_LIGHT'
  | 'INDUSTRIAL_WALL_CREAM'
  | 'INDUSTRIAL_FLOOR_WOOD_DARK'
  | 'INDUSTRIAL_WALL_BRICK_EXPOSED'
  | 'INDUSTRIAL_WALL_CONCRETE_VISIBLE'
  | 'INDUSTRIAL_BATH_WALL_TILE_GRAY'
  | 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY'
  | 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY'
  | 'INDUSTRIAL_KITCHEN_CABINET'
  | 'INDUSTRIAL_COUNTERTOP'
  | 'INDUSTRIAL_EXTERIOR'
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
  | 'FIXTURE_METAL_CHROME'
  | 'FIXTURE_GLASS'
  | 'FIXTURE_APPLIANCE'
  | 'TOE_KICK_DARK';

export interface MaterialTextureMaps {
  albedo: string;
  normalGl?: string;
  roughness?: string;
  ao?: string;
  metalness?: string;
}

export type ProceduralTextureKind = 'tile' | 'paint' | 'stucco' | 'stone';

/** Canvas-drawn stand-in for a texture set we do not have as an asset yet. */
export interface ProceduralTextureSpec {
  kind: ProceduralTextureKind;
  color: string;
  grout?: string;
  /** Tile size in meters, [width, height] — only for kind 'tile'. */
  tile?: [number, number];
}

export interface MaterialDefinition {
  id: MaterialId;
  provider: MaterialProvider;
  assetSlug?: string;
  assetName?: string;
  license?: 'CC0' | 'internal';
  /** Meters one texture repeat covers. UVs arrive in meters, so this is the only scale. */
  physicalWidthMeters?: number;
  physicalHeightMeters?: number;
  maps?: MaterialTextureMaps;
  procedural?: ProceduralTextureSpec;
  baseColor?: number;
  roughness: number;
  metalness: number;
  normalScale?: number;
  opacity?: number;
  transparent?: boolean;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  status: MaterialStatus;
}

/**
 * What a mesh IS, in finishing terms. Geometry is built once and tagged with a role;
 * switching style only re-resolves the role to a MaterialId, never rebuilds geometry.
 */
export type SurfaceFinishRole =
  | 'EXTERIOR'
  | 'DRY_WALL'
  | 'BATHROOM_WAINSCOT'
  | 'BATHROOM_ABOVE'
  | 'FLOOR_DRY'
  | 'FLOOR_BATH'
  | 'CEILING'
  | 'BASEBOARD'
  | 'DOOR'
  | 'FRAME'
  | 'BACKSPLASH'
  | 'CABINET'
  | 'COUNTERTOP'
  | 'TOE_KICK';

/** Accent finishes a style may apply; absent means the style has no accent surfaces. */
export interface StyleAccentRule {
  brickAccentMaterialId?: MaterialId;
  concreteMaterialId?: MaterialId;
  /** Only paint concrete where the assembly was already inferred as concrete. */
  concreteOnInferredConcrete: boolean;
}

export interface StyleMaterialPreset {
  styleId: InteriorStyleId;
  label: string;
  dryWall: MaterialId;
  dryFloor: MaterialId;
  /** Bathroom wall below WAINSCOT_TOP_M. */
  bathroomWainscot: MaterialId;
  /** Bathroom wall above WAINSCOT_TOP_M. */
  bathroomWallAbove: MaterialId;
  /** Alias of bathroomWainscot, kept for callers that predate the 2.10 m cut. */
  bathroomWall: MaterialId;
  bathroomFloor: MaterialId;
  kitchenBacksplash: MaterialId;
  kitchenCabinet: MaterialId;
  toeKick: MaterialId;
  countertop: MaterialId;
  exterior: MaterialId;
  ceiling: MaterialId;
  baseboard: MaterialId;
  door: MaterialId;
  frame: MaterialId;
  accentRule: StyleAccentRule | null;
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

/** What floorplan-geometry writes on every mesh it builds. */
export interface SurfaceUserData {
  finishRole?: SurfaceFinishRole;
  accentKind?: AccentKind;
  materialId?: MaterialId | null;
  [key: string]: unknown;
}
