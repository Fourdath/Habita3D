import * as THREE from 'three';

import type { EnvironmentBounds } from './terrain';
import { terrainSurfaceY } from './terrain';
import {
  VEGETATION_FOLIAGE_COLOR,
  VEGETATION_FOLIAGE_HEIGHT_M,
  VEGETATION_FOLIAGE_RADIUS_M,
  VEGETATION_MAX_COUNT,
  VEGETATION_MIN_COUNT,
  VEGETATION_SAFETY_MARGIN_M,
  VEGETATION_SCALE_MAX,
  VEGETATION_SCALE_MIN,
  VEGETATION_TRUNK_COLOR,
  VEGETATION_TRUNK_HEIGHT_M,
  VEGETATION_TRUNK_RADIUS_M,
} from './environment.constants';

/**
 * Deterministic PRNG (mulberry32) — "the same seed must always produce the same
 * environment" only holds if we don't use Math.random() for placement.
 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derived from the house's own footprint: same floor plan -> same seed -> same trees. */
export function seedFromBounds(bounds: EnvironmentBounds): number {
  const a = Math.round(bounds.houseWidth * 1000);
  const b = Math.round(bounds.houseDepth * 1000);
  return ((a * 73856093) ^ (b * 19349663)) >>> 0;
}

/**
 * Low-poly trees (cylinder trunk + cone foliage) via two InstancedMeshes, scattered
 * across the terrain but never inside VEGETATION_SAFETY_MARGIN_M of the house's own
 * bounding box (keeps them out of the way of doors/walls). Deterministic per `seed`.
 */
export function buildVegetation(bounds: EnvironmentBounds, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vegetation';
  group.userData = { semanticType: 'vegetation' };

  const random = createSeededRandom(seed);
  const targetCount = VEGETATION_MIN_COUNT + Math.floor(random() * (VEGETATION_MAX_COUNT - VEGETATION_MIN_COUNT + 1));

  const trunkGeometry = new THREE.CylinderGeometry(
    VEGETATION_TRUNK_RADIUS_M * 0.7,
    VEGETATION_TRUNK_RADIUS_M,
    VEGETATION_TRUNK_HEIGHT_M,
    6,
  );
  const foliageGeometry = new THREE.ConeGeometry(VEGETATION_FOLIAGE_RADIUS_M, VEGETATION_FOLIAGE_HEIGHT_M, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: VEGETATION_TRUNK_COLOR, roughness: 1 });
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: VEGETATION_FOLIAGE_COLOR, roughness: 0.9 });

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, targetCount);
  const foliage = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, targetCount);
  // Distant background decoration — excluded from the shadow pass for performance.
  trunks.castShadow = false;
  foliage.castShadow = false;

  const matrix = new THREE.Matrix4();
  const groundY = terrainSurfaceY();
  const halfWidth = bounds.terrainWidth / 2;
  const halfDepth = bounds.terrainDepth / 2;

  let placed = 0;
  const maxAttempts = targetCount * 20;
  for (let attempt = 0; placed < targetCount && attempt < maxAttempts; attempt++) {
    const x = bounds.centerX + (random() * 2 - 1) * halfWidth * 0.92;
    const z = bounds.centerZ + (random() * 2 - 1) * halfDepth * 0.92;

    const withinSafetyZone =
      x > bounds.houseMinX - VEGETATION_SAFETY_MARGIN_M &&
      x < bounds.houseMaxX + VEGETATION_SAFETY_MARGIN_M &&
      z > bounds.houseMinZ - VEGETATION_SAFETY_MARGIN_M &&
      z < bounds.houseMaxZ + VEGETATION_SAFETY_MARGIN_M;
    if (withinSafetyZone) {
      continue;
    }

    const scale = VEGETATION_SCALE_MIN + random() * (VEGETATION_SCALE_MAX - VEGETATION_SCALE_MIN);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0));
    const scaleVec = new THREE.Vector3(scale, scale, scale);

    matrix.compose(new THREE.Vector3(x, groundY + (VEGETATION_TRUNK_HEIGHT_M * scale) / 2, z), rotation, scaleVec);
    trunks.setMatrixAt(placed, matrix);

    matrix.compose(
      new THREE.Vector3(x, groundY + VEGETATION_TRUNK_HEIGHT_M * scale + (VEGETATION_FOLIAGE_HEIGHT_M * scale) / 2, z),
      rotation,
      scaleVec,
    );
    foliage.setMatrixAt(placed, matrix);

    placed++;
  }

  // A too-large safety zone relative to the terrain can starve placement attempts —
  // render exactly how many were actually placed rather than leaving stale/identity
  // matrices for unplaced instance slots.
  trunks.count = placed;
  foliage.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;

  group.add(trunks, foliage);
  return group;
}
