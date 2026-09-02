import * as THREE from 'three';

import type {
  Floorplan,
  FloorplanWall,
  Point2,
} from '../../../core/floorplan/floorplan.types';

import { FLOORPLAN_FLOOR_THICKNESS, FLOORPLAN_WALL_HEIGHT } from './viewer-3d.constants';

/**
 * Floorplan → THREE.Group. Pure geometry generation, no Angular/scene/camera/player
 * dependencies, so it can be unit-tested and reused independently of the engine.
 *
 * Wall/opening segmentation adapted from Floorplan2Walkthru's meshGen.ts
 * (https://github.com/Teetertater/Floorplan2Walkthru/blob/main/src/scene/meshGen.ts):
 * a wall with no doors/windows keeps its raw SVG polygon (exact mitered corners); a
 * wall with openings is rebuilt from its centerline + thickness as solid segments
 * around each opening, plus a sill below and a lintel above where relevant — leaving a
 * real, walkable gap rather than a decal on top of a solid wall.
 */

const EPSILON = 1e-3;

export interface FloorplanMaterials {
  wall: THREE.Material;
  floor: THREE.Material;
}

/** Plain, unlit-friendly placeholder materials — no textures, visual design is out of scope. */
export function createFloorplanMaterials(): FloorplanMaterials {
  return {
    wall: new THREE.MeshStandardMaterial({
      color: 0xe4ded2,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0xb9ab97,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  };
}

export function buildFloorplanGroup(floorplan: Floorplan, materials: FloorplanMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cubicasa-floorplan';

  generateWalls(group, floorplan, materials.wall);

  if (floorplan.outerPerimeter.length >= 3) {
    addExtrudedPolygon(group, floorplan.outerPerimeter, -FLOORPLAN_FLOOR_THICKNESS, 0, materials.floor, 'floor');
  }

  return group;
}

interface WallOpening {
  tStart: number;
  tEnd: number;
  /** Wall stays solid from the floor up to this height (0 for a door). */
  sillHeight: number;
  /** Wall resumes solid from this height up to FLOORPLAN_WALL_HEIGHT. */
  lintelHeight: number;
}

function generateWalls(group: THREE.Group, floorplan: Floorplan, material: THREE.Material): void {
  for (const wall of floorplan.walls) {
    if (wall.polygon.length < 3) {
      continue;
    }

    const wallLength = distance(wall.start, wall.end);
    const openings = collectOpenings(floorplan, wall, wallLength);

    if (openings.length === 0) {
      // No openings — extrude the wall's own SVG polygon, preserving its exact
      // mitered corners instead of reconstructing an approximate rectangle.
      addExtrudedPolygon(group, wall.polygon, 0, FLOORPLAN_WALL_HEIGHT, material, 'wall');
      continue;
    }

    let cursor = 0;
    for (const opening of openings) {
      if (opening.tStart > cursor + EPSILON) {
        addExtrudedPolygon(
          group,
          centerlineSubQuad(wall, cursor, opening.tStart),
          0,
          FLOORPLAN_WALL_HEIGHT,
          material,
          'wall',
        );
      }

      const openingQuad = centerlineSubQuad(wall, opening.tStart, opening.tEnd);
      if (opening.sillHeight > EPSILON) {
        addExtrudedPolygon(group, openingQuad, 0, opening.sillHeight, material, 'wall');
      }
      if (opening.lintelHeight < FLOORPLAN_WALL_HEIGHT - EPSILON) {
        addExtrudedPolygon(group, openingQuad, opening.lintelHeight, FLOORPLAN_WALL_HEIGHT, material, 'lintel');
      }

      cursor = opening.tEnd;
    }

    if (cursor < 1 - EPSILON) {
      addExtrudedPolygon(group, centerlineSubQuad(wall, cursor, 1), 0, FLOORPLAN_WALL_HEIGHT, material, 'wall');
    }
  }
}

function collectOpenings(floorplan: Floorplan, wall: FloorplanWall, wallLength: number): WallOpening[] {
  const raw: WallOpening[] = [];

  for (const door of floorplan.doors) {
    if (door.wallId !== wall.id) {
      continue;
    }
    const halfWidthT = wallLength > EPSILON ? door.width / 2 / wallLength : 0.5;
    raw.push({
      tStart: Math.max(0, door.position - halfWidthT),
      tEnd: Math.min(1, door.position + halfWidthT),
      sillHeight: 0,
      lintelHeight: door.height,
    });
  }

  for (const windowOpening of floorplan.windows) {
    if (windowOpening.wallId !== wall.id) {
      continue;
    }
    const halfWidthT = wallLength > EPSILON ? windowOpening.width / 2 / wallLength : 0.5;
    raw.push({
      tStart: Math.max(0, windowOpening.position - halfWidthT),
      tEnd: Math.min(1, windowOpening.position + halfWidthT),
      sillHeight: windowOpening.sillHeight,
      lintelHeight: windowOpening.sillHeight + windowOpening.height,
    });
  }

  raw.sort((a, b) => a.tStart - b.tStart);

  const merged: WallOpening[] = [];
  for (const opening of raw) {
    const last = merged[merged.length - 1];
    if (last && opening.tStart < last.tEnd + EPSILON) {
      last.tEnd = Math.max(last.tEnd, opening.tEnd);
      last.sillHeight = Math.min(last.sillHeight, opening.sillHeight);
      last.lintelHeight = Math.max(last.lintelHeight, opening.lintelHeight);
    } else {
      merged.push({ ...opening });
    }
  }

  return merged;
}

/**
 * Rebuilds a `[tStart,tEnd]` slice of a wall as a quad from its centerline and
 * thickness — needed once a wall has openings, since the raw SVG polygon can't be
 * partially reused. Extends half a thickness past the wall's own ends (t<=0 / t>=1)
 * so solid segments still overlap the neighboring wall's corner instead of leaving a
 * sliver gap at the miter joint.
 */
function centerlineSubQuad(wall: FloorplanWall, tStart: number, tEnd: number): Point2[] {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) {
    return [];
  }

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const halfThickness = wall.thickness / 2;

  let sx = wall.start[0] + dx * tStart;
  let sy = wall.start[1] + dy * tStart;
  let ex = wall.start[0] + dx * tEnd;
  let ey = wall.start[1] + dy * tEnd;

  if (tStart <= EPSILON) {
    sx -= ux * halfThickness;
    sy -= uy * halfThickness;
  }
  if (tEnd >= 1 - EPSILON) {
    ex += ux * halfThickness;
    ey += uy * halfThickness;
  }

  return [
    [sx + nx * halfThickness, sy + ny * halfThickness],
    [ex + nx * halfThickness, ey + ny * halfThickness],
    [ex - nx * halfThickness, ey - ny * halfThickness],
    [sx - nx * halfThickness, sy - ny * halfThickness],
  ];
}

/**
 * Extrudes a 2D polygon (plan X/Y) into a Y-up prism from `yBottom` to `yTop`, using
 * the same orientation already validated visually in this codebase's first CubiCasa
 * test: build the Shape directly in plan (x, y), extrude along the added axis, then
 * `rotateX(-Math.PI / 2)` to turn that axis into world Y (height).
 */
function addExtrudedPolygon(
  group: THREE.Group,
  points: Point2[],
  yBottom: number,
  yTop: number,
  material: THREE.Material,
  type: 'wall' | 'lintel' | 'floor',
): void {
  const height = yTop - yBottom;
  if (points.length < 3 || height <= EPSILON) {
    return;
  }

  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = yBottom;
  mesh.userData = { type };
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  group.add(mesh);
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
