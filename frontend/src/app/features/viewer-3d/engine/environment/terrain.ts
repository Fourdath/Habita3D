import * as THREE from 'three';

import type { Floorplan, Point2 } from '../../../../core/floorplan/floorplan.types';
import { FLOORPLAN_FLOOR_THICKNESS } from '../viewer-3d.constants';

import {
  ENVIRONMENT_MARGIN_RATIO,
  ENVIRONMENT_MIN_MARGIN_M,
  TERRAIN_GAP_BELOW_HOUSE_FLOOR_M,
  TERRAIN_THICKNESS_M,
} from './environment.constants';

/**
 * The house's footprint in world space and the exterior terrain built around it.
 * World X = plan X, world Z = -plan Y (the same mapping floorplan-geometry.ts's
 * rotateX(-Math.PI/2) extrusion already establishes), so a plan-space bounding box
 * translates directly into a world-space one without re-deriving the transform here.
 */
export interface EnvironmentBounds {
  /** House footprint, world space. */
  houseMinX: number;
  houseMaxX: number;
  houseMinZ: number;
  houseMaxZ: number;
  houseWidth: number;
  houseDepth: number;
  centerX: number;
  centerZ: number;
  /** max(ENVIRONMENT_MIN_MARGIN_M, ENVIRONMENT_MARGIN_RATIO * longer house side). */
  margin: number;
  terrainWidth: number;
  terrainDepth: number;
}

function planPointsOf(floorplan: Floorplan): Point2[] {
  return floorplan.outerPerimeter.length >= 3
    ? floorplan.outerPerimeter
    : floorplan.walls.flatMap((wall) => wall.polygon);
}

export function computeEnvironmentBounds(floorplan: Floorplan): EnvironmentBounds {
  const points = planPointsOf(floorplan);

  let minPlanX = -1;
  let maxPlanX = 1;
  let minPlanY = -1;
  let maxPlanY = 1;

  if (points.length > 0) {
    minPlanX = Infinity;
    maxPlanX = -Infinity;
    minPlanY = Infinity;
    maxPlanY = -Infinity;
    for (const [x, y] of points) {
      minPlanX = Math.min(minPlanX, x);
      maxPlanX = Math.max(maxPlanX, x);
      minPlanY = Math.min(minPlanY, y);
      maxPlanY = Math.max(maxPlanY, y);
    }
  }

  // world X = plan X ; world Z = -plan Y, so the plan's Y span becomes the Z span with
  // min/max swapped.
  const houseMinX = minPlanX;
  const houseMaxX = maxPlanX;
  const houseMinZ = -maxPlanY;
  const houseMaxZ = -minPlanY;

  const houseWidth = Math.max(houseMaxX - houseMinX, 0.01);
  const houseDepth = Math.max(houseMaxZ - houseMinZ, 0.01);
  const margin = Math.max(ENVIRONMENT_MIN_MARGIN_M, ENVIRONMENT_MARGIN_RATIO * Math.max(houseWidth, houseDepth));

  return {
    houseMinX,
    houseMaxX,
    houseMinZ,
    houseMaxZ,
    houseWidth,
    houseDepth,
    centerX: (houseMinX + houseMaxX) / 2,
    centerZ: (houseMinZ + houseMaxZ) / 2,
    margin,
    terrainWidth: houseWidth + margin * 2,
    terrainDepth: houseDepth + margin * 2,
  };
}

/** Y of the terrain's top (walkable) surface — always below the house's own floor slab. */
export function terrainSurfaceY(): number {
  return -FLOORPLAN_FLOOR_THICKNESS - TERRAIN_GAP_BELOW_HOUSE_FLOOR_M;
}

export function buildTerrainMesh(bounds: EnvironmentBounds, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(bounds.terrainWidth, TERRAIN_THICKNESS_M, bounds.terrainDepth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(bounds.centerX, terrainSurfaceY() - TERRAIN_THICKNESS_M / 2, bounds.centerZ);
  mesh.receiveShadow = true;
  mesh.userData = { semanticType: 'terrain' };
  return mesh;
}
