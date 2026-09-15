import type * as THREE from 'three';

import type { SurfaceManifest } from '../../../core/budget/surface-manifest.types';
import type { AccentCandidate, WallConstruction } from '../../../core/construction/wall-assembly.types';
import type { KitchenRun } from '../../../core/floorplan/fixture.types';
import type { Point2 } from '../../../core/floorplan/floorplan.types';
import type { MaterialId, SurfaceUserData } from '../../../core/materials/material.types';

/** One mesh to build: geometry plus the finish role that decides its material. */
export interface MeshJob {
  geometry: THREE.BufferGeometry;
  materialId: MaterialId;
  name: string;
  userData: SurfaceUserData;
  position?: [number, number, number];
  y?: number;
  rotationY?: number;
  castShadow?: boolean;
}

export type FinishResolver = (userData: SurfaceUserData) => MaterialId;

/** Wall span the player cannot walk through, in plan coordinates. */
export interface CollisionSegment {
  start: Point2;
  end: Point2;
  half: number;
}

export interface FloorplanBuildResult {
  group: THREE.Group;
  manifest: SurfaceManifest;
  collisionSegments: CollisionSegment[];
  constructions: WallConstruction[];
  accents: AccentCandidate[];
  kitchenRuns: KitchenRun[];
}
