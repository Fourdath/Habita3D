import * as THREE from 'three';

import type {
  Floorplan,
  FloorplanDoor,
  FloorplanWall,
  FloorplanWindow,
  Point2,
} from '../../../core/floorplan/floorplan.types';

import { FLOORPLAN_FLOOR_THICKNESS, FLOORPLAN_WALL_HEIGHT } from './viewer-3d.constants';
import type { SemanticType } from './viewer-3d.types';

const EPSILON = 1e-3;
const CEILING_THICKNESS = 0.08;
const BASEBOARD_HEIGHT = 0.1;
const BASEBOARD_DEPTH = 0.018;
const TRIM_WIDTH = 0.07;
const TRIM_PROJECTION = 0.025;
const WINDOW_FRAME_WIDTH = 0.055;
const WINDOW_PROJECTION = 0.035;
const WINDOW_GLASS_THICKNESS = 0.01;
const WINDOW_SILL_HEIGHT = 0.035;
const MAX_ROOM_POINT_LIGHTS = 12;

export interface FloorplanMaterials {
  interiorWall: THREE.Material;
  exteriorWall: THREE.Material;
  floor: THREE.Material;
  ceiling: THREE.Material;
  trim: THREE.Material;
  windowFrame: THREE.Material;
  glass: THREE.Material;
  fixture: THREE.Material;
}

/** Neutral placeholders used until the selected interior style finishes loading. */
export function createFloorplanMaterials(): FloorplanMaterials {
  const interiorWall = standardMaterial(0xe8e2d8, 0.92);
  return {
    interiorWall,
    exteriorWall: standardMaterial(0xc9c0b3, 0.95),
    floor: standardMaterial(0xb9ab97, 0.88),
    ceiling: standardMaterial(0xf2eee7, 0.95),
    trim: standardMaterial(0xf4f0e9, 0.82),
    windowFrame: standardMaterial(0xe7e3dc, 0.75),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xbdd9e4,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    fixture: standardMaterial(0xffe0a3, 0.55),
  };
}

export function buildFloorplanGroup(floorplan: Floorplan, materials: FloorplanMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cubicasa-floorplan';

  generateWalls(group, floorplan, materials.interiorWall);
  generateExteriorWallFinishes(group, floorplan, materials.exteriorWall);

  if (floorplan.outerPerimeter.length >= 3) {
    addExtrudedPolygon(
      group,
      floorplan.outerPerimeter,
      -FLOORPLAN_FLOOR_THICKNESS,
      0,
      materials.floor,
      'floor',
    );
    addExtrudedPolygon(
      group,
      floorplan.outerPerimeter,
      FLOORPLAN_WALL_HEIGHT,
      FLOORPLAN_WALL_HEIGHT + CEILING_THICKNESS,
      materials.ceiling,
      'ceiling',
    );
  }

  generateBaseboards(group, floorplan, materials.trim);
  generateDoorCasings(group, floorplan, materials.trim);
  generateWindows(group, floorplan, materials);
  generateCeilingFixtures(group, floorplan, materials.fixture);

  return group;
}

interface WallOpening {
  tStart: number;
  tEnd: number;
  sillHeight: number;
  lintelHeight: number;
}

function standardMaterial(color: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side: THREE.DoubleSide });
}

function generateWalls(group: THREE.Group, floorplan: Floorplan, material: THREE.Material): void {
  for (const wall of floorplan.walls) {
    if (wall.polygon.length < 3) {
      continue;
    }

    const wallLength = distance(wall.start, wall.end);
    const openings = collectOpenings(floorplan, wall, wallLength);
    if (openings.length === 0) {
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
        addExtrudedPolygon(
          group,
          openingQuad,
          opening.lintelHeight,
          FLOORPLAN_WALL_HEIGHT,
          material,
          'wall',
        );
      }
      cursor = opening.tEnd;
    }

    if (cursor < 1 - EPSILON) {
      addExtrudedPolygon(
        group,
        centerlineSubQuad(wall, cursor, 1),
        0,
        FLOORPLAN_WALL_HEIGHT,
        material,
        'wall',
      );
    }
  }
}

/** Adds a thin facade surface only to the outside face of exterior walls. */
function generateExteriorWallFinishes(group: THREE.Group, floorplan: Floorplan, material: THREE.Material): void {
  for (const wall of floorplan.walls) {
    if (!wall.isExterior) {
      continue;
    }
    const wallLength = distance(wall.start, wall.end);
    if (wallLength < EPSILON) {
      continue;
    }

    const side = resolveExteriorSide(wall, floorplan);
    const openings = collectOpenings(floorplan, wall, wallLength);
    const segments: Array<[number, number, number, number]> = [];
    let cursor = 0;

    for (const opening of openings) {
      if (opening.tStart > cursor + EPSILON) {
        segments.push([cursor, opening.tStart, 0, FLOORPLAN_WALL_HEIGHT]);
      }
      if (opening.sillHeight > EPSILON) {
        segments.push([opening.tStart, opening.tEnd, 0, opening.sillHeight]);
      }
      if (opening.lintelHeight < FLOORPLAN_WALL_HEIGHT - EPSILON) {
        segments.push([opening.tStart, opening.tEnd, opening.lintelHeight, FLOORPLAN_WALL_HEIGHT]);
      }
      cursor = opening.tEnd;
    }
    if (cursor < 1 - EPSILON) {
      segments.push([cursor, 1, 0, FLOORPLAN_WALL_HEIGHT]);
    }
    if (segments.length === 0 && openings.length === 0) {
      segments.push([0, 1, 0, FLOORPLAN_WALL_HEIGHT]);
    }

    for (const [tStart, tEnd, yBottom, yTop] of segments) {
      addWallFace(group, wall, tStart, tEnd, yBottom, yTop, side, material, 'exteriorWall');
    }
  }
}

function generateBaseboards(group: THREE.Group, floorplan: Floorplan, material: THREE.Material): void {
  for (const wall of floorplan.walls) {
    const length = distance(wall.start, wall.end);
    if (length < EPSILON) {
      continue;
    }

    const exteriorSide = wall.isExterior ? resolveExteriorSide(wall, floorplan) : 0;
    const interiorSides = wall.isExterior ? ([-exteriorSide] as number[]) : [-1, 1];
    const doorIntervals = floorplan.doors
      .filter((door) => door.wallId === wall.id)
      .map((door) => openingInterval(door.position, door.width, length))
      .sort((a, b) => a[0] - b[0]);
    const solidIntervals = subtractIntervals(doorIntervals);

    for (const side of interiorSides) {
      for (const [tStart, tEnd] of solidIntervals) {
        addWallAlignedBox(
          group,
          wall,
          tStart,
          tEnd,
          BASEBOARD_HEIGHT,
          BASEBOARD_DEPTH,
          BASEBOARD_HEIGHT / 2,
          side,
          material,
          'baseboard',
          0.004,
        );
      }
    }
  }
}

function generateDoorCasings(group: THREE.Group, floorplan: Floorplan, material: THREE.Material): void {
  for (const door of floorplan.doors) {
    const wall = floorplan.walls.find((candidate) => candidate.id === door.wallId);
    if (!wall) {
      continue;
    }
    const length = distance(wall.start, wall.end);
    if (length < EPSILON) {
      continue;
    }
    const [tStart, tEnd] = openingInterval(door.position, door.width, length);
    const postT = TRIM_WIDTH / length;
    const sides = wall.isExterior ? [-resolveExteriorSide(wall, floorplan)] : [-1, 1];

    for (const side of sides) {
      addWallAlignedBox(
        group,
        wall,
        Math.max(0, tStart - postT),
        tStart,
        Math.min(door.height + TRIM_WIDTH, FLOORPLAN_WALL_HEIGHT),
        TRIM_PROJECTION,
        Math.min(door.height + TRIM_WIDTH, FLOORPLAN_WALL_HEIGHT) / 2,
        side,
        material,
        'doorFrame',
      );
      addWallAlignedBox(
        group,
        wall,
        tEnd,
        Math.min(1, tEnd + postT),
        Math.min(door.height + TRIM_WIDTH, FLOORPLAN_WALL_HEIGHT),
        TRIM_PROJECTION,
        Math.min(door.height + TRIM_WIDTH, FLOORPLAN_WALL_HEIGHT) / 2,
        side,
        material,
        'doorFrame',
      );
      addWallAlignedBox(
        group,
        wall,
        tStart,
        tEnd,
        TRIM_WIDTH,
        TRIM_PROJECTION,
        Math.min(door.height + TRIM_WIDTH / 2, FLOORPLAN_WALL_HEIGHT - TRIM_WIDTH / 2),
        side,
        material,
        'doorFrame',
      );
    }
  }
}

function generateWindows(group: THREE.Group, floorplan: Floorplan, materials: FloorplanMaterials): void {
  for (const windowOpening of floorplan.windows) {
    const wall = floorplan.walls.find((candidate) => candidate.id === windowOpening.wallId);
    if (!wall) {
      continue;
    }
    const length = distance(wall.start, wall.end);
    if (length < EPSILON) {
      continue;
    }
    const [tStart, tEnd] = openingInterval(windowOpening.position, windowOpening.width, length);
    const openingCenterY = windowOpening.sillHeight + windowOpening.height / 2;

    addWallAlignedBox(
      group,
      wall,
      tStart,
      tEnd,
      windowOpening.height,
      WINDOW_GLASS_THICKNESS,
      openingCenterY,
      0,
      materials.glass,
      'window',
    );

    const frameT = Math.min(WINDOW_FRAME_WIDTH / length, (tEnd - tStart) / 3);
    const frameHeight = Math.min(WINDOW_FRAME_WIDTH, windowOpening.height / 3);
    addWallAlignedBox(group, wall, tStart, tStart + frameT, windowOpening.height, WINDOW_PROJECTION, openingCenterY, 0, materials.windowFrame, 'windowFrame');
    addWallAlignedBox(group, wall, tEnd - frameT, tEnd, windowOpening.height, WINDOW_PROJECTION, openingCenterY, 0, materials.windowFrame, 'windowFrame');
    addWallAlignedBox(group, wall, tStart, tEnd, frameHeight, WINDOW_PROJECTION, windowOpening.sillHeight + frameHeight / 2, 0, materials.windowFrame, 'windowFrame');
    addWallAlignedBox(group, wall, tStart, tEnd, frameHeight, WINDOW_PROJECTION, windowOpening.sillHeight + windowOpening.height - frameHeight / 2, 0, materials.windowFrame, 'windowFrame');

    if (windowOpening.width >= 1.2) {
      const centerT = (tStart + tEnd) / 2;
      addWallAlignedBox(
        group,
        wall,
        centerT - frameT / 2,
        centerT + frameT / 2,
        Math.max(frameHeight, windowOpening.height - frameHeight * 2),
        WINDOW_PROJECTION,
        openingCenterY,
        0,
        materials.windowFrame,
        'windowFrame',
      );
    }

    addWallAlignedBox(
      group,
      wall,
      Math.max(0, tStart - frameT / 2),
      Math.min(1, tEnd + frameT / 2),
      WINDOW_SILL_HEIGHT,
      wall.thickness + 0.12,
      windowOpening.sillHeight + WINDOW_SILL_HEIGHT / 2,
      0,
      materials.trim,
      'windowFrame',
    );
  }
}

function generateCeilingFixtures(group: THREE.Group, floorplan: Floorplan, material: THREE.Material): void {
  const rankedRooms = floorplan.rooms
    .filter((room) => room.polygon.length >= 3)
    .map((room) => ({ room, area: polygonArea(room.polygon), center: polygonCentroid(room.polygon) }))
    .sort((a, b) => b.area - a.area);
  const illuminatedRoomIds = new Set(rankedRooms.slice(0, MAX_ROOM_POINT_LIGHTS).map(({ room }) => room.id));

  for (const { room, area, center } of rankedRooms) {
    const geometry = new THREE.CylinderGeometry(0.11, 0.13, 0.045, 12);
    const fixture = new THREE.Mesh(geometry, material);
    fixture.position.set(center[0], FLOORPLAN_WALL_HEIGHT - 0.04, -center[1]);
    fixture.userData = { semanticType: 'lightFixture' satisfies SemanticType };
    group.add(fixture);

    if (illuminatedRoomIds.has(room.id)) {
      const light = new THREE.PointLight(0xffd6a3, 0.75, Math.max(4.5, Math.sqrt(area) * 2.3), 2);
      light.position.set(center[0], FLOORPLAN_WALL_HEIGHT - 0.22, -center[1]);
      light.castShadow = false;
      light.userData = {
        semanticType: 'roomLight' satisfies SemanticType,
        intensityScale: THREE.MathUtils.clamp(Math.sqrt(Math.max(area, 1)) / 3, 0.65, 1.25),
      };
      group.add(light);
    }
  }
}

function collectOpenings(floorplan: Floorplan, wall: FloorplanWall, wallLength: number): WallOpening[] {
  const raw: WallOpening[] = [];
  for (const door of floorplan.doors) {
    if (door.wallId !== wall.id) continue;
    const [tStart, tEnd] = openingInterval(door.position, door.width, wallLength);
    raw.push({ tStart, tEnd, sillHeight: 0, lintelHeight: door.height });
  }
  for (const windowOpening of floorplan.windows) {
    if (windowOpening.wallId !== wall.id) continue;
    const [tStart, tEnd] = openingInterval(windowOpening.position, windowOpening.width, wallLength);
    raw.push({
      tStart,
      tEnd,
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

function openingInterval(position: number, width: number, wallLength: number): [number, number] {
  const halfWidthT = wallLength > EPSILON ? width / 2 / wallLength : 0.5;
  return [Math.max(0, position - halfWidthT), Math.min(1, position + halfWidthT)];
}

function subtractIntervals(exclusions: Array<[number, number]>): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  let cursor = 0;
  for (const [start, end] of exclusions) {
    if (start > cursor + EPSILON) result.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < 1 - EPSILON) result.push([cursor, 1]);
  return result;
}

function centerlineSubQuad(wall: FloorplanWall, tStart: number, tEnd: number): Point2[] {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return [];

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

function addWallAlignedBox(
  group: THREE.Group,
  wall: FloorplanWall,
  tStart: number,
  tEnd: number,
  height: number,
  depth: number,
  centerY: number,
  side: number,
  material: THREE.Material,
  semanticType: SemanticType,
  gap = 0,
): void {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const wallLength = Math.hypot(dx, dy);
  const boxLength = wallLength * Math.max(0, tEnd - tStart);
  if (boxLength < EPSILON || height < EPSILON || depth < EPSILON) return;

  const centerT = (tStart + tEnd) / 2;
  const nx = -dy / wallLength;
  const ny = dx / wallLength;
  const offset = side === 0 ? 0 : side * (wall.thickness / 2 + depth / 2 + gap);
  const planX = wall.start[0] + dx * centerT + nx * offset;
  const planY = wall.start[1] + dy * centerT + ny * offset;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(boxLength, height, depth), material);
  mesh.position.set(planX, centerY, -planY);
  mesh.rotation.y = Math.atan2(dy, dx);
  mesh.userData = { semanticType };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addWallFace(
  group: THREE.Group,
  wall: FloorplanWall,
  tStart: number,
  tEnd: number,
  yBottom: number,
  yTop: number,
  side: number,
  material: THREE.Material,
  semanticType: SemanticType,
): void {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < EPSILON || yTop <= yBottom + EPSILON) return;
  const nx = -dy / length;
  const ny = dx / length;
  const offset = side * (wall.thickness / 2 + 0.0015);
  const start: Point2 = [wall.start[0] + dx * tStart + nx * offset, wall.start[1] + dy * tStart + ny * offset];
  const end: Point2 = [wall.start[0] + dx * tEnd + nx * offset, wall.start[1] + dy * tEnd + ny * offset];
  const positions = new Float32Array([
    start[0], yBottom, -start[1],
    end[0], yBottom, -end[1],
    end[0], yTop, -end[1],
    start[0], yTop, -start[1],
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const segmentLength = length * Math.max(0, tEnd - tStart);
  const segmentHeight = yTop - yBottom;
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      [0, 0, segmentLength, 0, segmentLength, segmentHeight, 0, segmentHeight],
      2,
    ),
  );
  geometry.setIndex(side < 0 ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { semanticType };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function resolveExteriorSide(wall: FloorplanWall, floorplan: Floorplan): number {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return 1;
  const midpoint: Point2 = [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
  const nx = -dy / length;
  const ny = dx / length;
  const probeDistance = wall.thickness / 2 + 0.04;
  const plus: Point2 = [midpoint[0] + nx * probeDistance, midpoint[1] + ny * probeDistance];
  const minus: Point2 = [midpoint[0] - nx * probeDistance, midpoint[1] - ny * probeDistance];
  const plusInside = floorplan.rooms.some((room) => pointInPolygon(plus, room.polygon));
  const minusInside = floorplan.rooms.some((room) => pointInPolygon(minus, room.polygon));
  if (plusInside !== minusInside) return plusInside ? -1 : 1;

  const plusInPerimeter = pointInPolygon(plus, floorplan.outerPerimeter);
  const minusInPerimeter = pointInPolygon(minus, floorplan.outerPerimeter);
  if (plusInPerimeter !== minusInPerimeter) return plusInPerimeter ? -1 : 1;
  return 1;
}

function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonArea(polygon: Point2[]): number {
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

function polygonCentroid(polygon: Point2[]): Point2 {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < EPSILON) {
    return [
      polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
      polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
    ];
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function addExtrudedPolygon(
  group: THREE.Group,
  points: Point2[],
  yBottom: number,
  yTop: number,
  material: THREE.Material,
  semanticType: SemanticType,
): void {
  const height = yTop - yBottom;
  if (points.length < 3 || height <= EPSILON) return;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = yBottom;
  mesh.userData = { semanticType };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
