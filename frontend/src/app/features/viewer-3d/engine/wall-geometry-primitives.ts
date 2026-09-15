import * as THREE from 'three';

import { openingMeters } from '../../../core/construction/wall-face-geometry';
import type { Floorplan, FloorplanWall, Point2 } from '../../../core/floorplan/floorplan.types';
import type { MaterialId, SurfaceFinishRole } from '../../../core/materials/material.types';
import { applyMetricBoxUvs, applyMetricPlanarUvs } from './materials/physical-uv-mapper';
import type { FinishResolver, MeshJob } from './surface-mesh.types';

const EPS = 1e-3;
/** Finish faces float this far off the wall core to avoid z-fighting. */
const FINISH_OFFSET = 0.0015;

export interface MergedOpening {
  tStart: number;
  tEnd: number;
  sillHeight: number;
  lintelHeight: number;
}

/** Doors and windows on one wall, merged where they overlap along the centerline. */
export function collectOpenings(floorplan: Floorplan, wall: FloorplanWall, wallLength: number): MergedOpening[] {
  const raw: MergedOpening[] = [];
  for (const door of floorplan.doors) {
    if (door.wallId !== wall.id) continue;
    const [startM, endM] = openingMeters(door.position, door.width, wallLength);
    raw.push({ tStart: startM / wallLength, tEnd: endM / wallLength, sillHeight: 0, lintelHeight: door.height });
  }
  for (const window of floorplan.windows) {
    if (window.wallId !== wall.id) continue;
    const [startM, endM] = openingMeters(window.position, window.width, wallLength);
    raw.push({
      tStart: startM / wallLength,
      tEnd: endM / wallLength,
      sillHeight: window.sillHeight,
      lintelHeight: window.sillHeight + window.height,
    });
  }
  raw.sort((left, right) => left.tStart - right.tStart);

  const merged: MergedOpening[] = [];
  for (const opening of raw) {
    const last = merged[merged.length - 1];
    if (last && opening.tStart < last.tEnd + EPS) {
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
 * Footprint quad of a sub-span of the wall core. The end caps extend by half the
 * thickness so corners close instead of leaving a notch at every junction.
 */
export function centerlineSubQuad(wall: FloorplanWall, tStart: number, tEnd: number): Point2[] {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < EPS) return [];
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const half = wall.thickness / 2;

  let startX = wall.start[0] + dx * tStart;
  let startY = wall.start[1] + dy * tStart;
  let endX = wall.start[0] + dx * tEnd;
  let endY = wall.start[1] + dy * tEnd;
  if (tStart <= EPS) {
    startX -= ux * half;
    startY -= uy * half;
  }
  if (tEnd >= 1 - EPS) {
    endX += ux * half;
    endY += uy * half;
  }
  return [
    [startX + nx * half, startY + ny * half],
    [endX + nx * half, endY + ny * half],
    [endX - nx * half, endY - ny * half],
    [startX - nx * half, startY - ny * half],
  ];
}

export function extrudedPolygonGeometry(points: Point2[], height: number, yBottom: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, yBottom, 0);
  geometry.computeVertexNormals();
  // ExtrudeGeometry's own UVs are in shape units, which stretched every texture.
  applyMetricBoxUvs(geometry);
  return geometry;
}

export function roomPlaneGeometry(points: Point2[], faceDown: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  if (faceDown) {
    const index = geometry.getIndex();
    if (index) {
      for (let offset = 0; offset < index.count; offset += 3) {
        const second = index.getX(offset + 1);
        index.setX(offset + 1, index.getX(offset + 2));
        index.setX(offset + 2, second);
      }
      index.needsUpdate = true;
    }
    geometry.computeVertexNormals();
  }
  applyMetricPlanarUvs(geometry, 'XZ');
  return geometry;
}

/**
 * One finish quad on a wall face. UVs are in meters — u runs along the wall, v up its
 * height — so tile size is identical on every panel regardless of panel size.
 */
export function wallFaceGeometry(
  wall: FloorplanWall, tStart: number, tEnd: number, yBottom: number, yTop: number,
  sideSign: 1 | -1, length: number,
): THREE.BufferGeometry {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const nx = -dy / length;
  const ny = dx / length;
  const offset = sideSign * (wall.thickness / 2 + FINISH_OFFSET);
  const start: Point2 = [wall.start[0] + dx * tStart + nx * offset, wall.start[1] + dy * tStart + ny * offset];
  const end: Point2 = [wall.start[0] + dx * tEnd + nx * offset, wall.start[1] + dy * tEnd + ny * offset];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    start[0], yBottom, -start[1],
    end[0], yBottom, -end[1],
    end[0], yTop, -end[1],
    start[0], yTop, -start[1],
  ]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    length * tStart, yBottom,
    length * tEnd, yBottom,
    length * tEnd, yTop,
    length * tStart, yTop,
  ], 2));
  geometry.setIndex(sideSign < 0 ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1]);
  geometry.computeVertexNormals();
  return geometry;
}

/** Box along an arbitrary plan segment (baseboard, backsplash), centered on the origin. */
export function planSegmentBoxGeometry(
  start: Point2, end: Point2, height: number, depth: number, centerY: number,
): THREE.BufferGeometry {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const geometry = new THREE.BoxGeometry(Math.max(length, 0.01), height, depth);
  applyMetricBoxUvs(geometry, [(start[0] + end[0]) / 2, centerY, 0]);
  geometry.rotateY(Math.atan2(end[1] - start[1], end[0] - start[0]));
  geometry.translate((start[0] + end[0]) / 2, centerY, -(start[1] + end[1]) / 2);
  return geometry;
}

export interface WallAlignedBoxOptions {
  wall: FloorplanWall;
  tStart: number;
  tEnd: number;
  height: number;
  depth: number;
  centerY: number;
  /** 0 centers the box in the wall; ±1 pushes it onto that face. */
  sideSign: 1 | -1 | 0;
  finishRole: SurfaceFinishRole | null;
  semanticType: string;
  fixedMaterialId?: MaterialId | null;
  castShadow?: boolean;
}

/** Trim, frames, glazing: a box aligned to the wall, positioned along its centerline. */
export function wallAlignedBox(options: WallAlignedBoxOptions, resolveFinish: FinishResolver): MeshJob {
  const { wall, tStart, tEnd, height, depth, centerY, sideSign, finishRole, semanticType } = options;
  const fixedMaterialId = options.fixedMaterialId ?? null;
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  const boxLength = Math.max(length * Math.max(0, tEnd - tStart), 0.01);
  const centerT = (tStart + tEnd) / 2;
  const nx = -dy / length;
  const ny = dx / length;
  const offset = sideSign === 0 ? 0 : sideSign * (wall.thickness / 2 + depth / 2);
  const x = wall.start[0] + dx * centerT + nx * offset;
  const y = wall.start[1] + dy * centerT + ny * offset;

  const geometry = new THREE.BoxGeometry(boxLength, Math.max(height, 0.01), Math.max(depth, 0.005));
  applyMetricBoxUvs(geometry, [x, centerY, 0]);
  const userData = { semanticType, finishRole: finishRole ?? undefined, wallId: wall.id, materialId: fixedMaterialId };

  return {
    geometry,
    materialId: finishRole ? resolveFinish(userData) : (fixedMaterialId ?? 'DEFAULT_WALL_NEUTRAL'),
    name: `${semanticType}-${wall.id}`,
    userData,
    position: [x, centerY, -y],
    rotationY: Math.atan2(dy, dx),
    castShadow: options.castShadow ?? true,
  };
}
