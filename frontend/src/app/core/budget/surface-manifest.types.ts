import type { AccentKind, WallAssemblyId, WallSideEnvironment, WallSideName } from '../construction/wall-assembly.types';
import type { RoomSemanticType } from '../floorplan/room-semantic.types';

/**
 * What the geometry builder ACTUALLY built, per surface. The budget is a take-off of
 * this manifest, so a wall face that was not built is never quoted and a face that was
 * built is never missed — there is no second, parallel estimate of the plan.
 */
export interface ManifestFaceRect {
  widthM: number;
  heightM: number;
}

export interface ManifestWallFace {
  wallId: string;
  side: WallSideName;
  environment: WallSideEnvironment;
  assemblyId: WallAssemblyId;
  roomId?: string;
  roomSemantic: RoomSemanticType;
  accentKind?: AccentKind;
  rects: ManifestFaceRect[];
  areaM2: number;
  /** Area below WAINSCOT_TOP_M on a bathroom face: the ceramic take-off. */
  wainscotAreaM2: number;
}

export interface ManifestFloor {
  roomId: string;
  name: string;
  semantic: RoomSemanticType;
  areaM2: number;
}

export interface ManifestCeiling {
  roomId: string;
  areaM2: number;
}

export interface ManifestBaseboard {
  roomId: string;
  lengthM: number;
}

export interface ManifestBacksplash {
  runId: string;
  roomId: string;
  lengthM: number;
  areaM2: number;
}

export interface ManifestConcreteWall {
  wallId: string;
  volumeM3: number;
}

export interface SurfaceManifest {
  wallFaces: ManifestWallFace[];
  floors: ManifestFloor[];
  ceilings: ManifestCeiling[];
  baseboards: ManifestBaseboard[];
  backsplash: ManifestBacksplash[];
  concrete: ManifestConcreteWall[];
}
