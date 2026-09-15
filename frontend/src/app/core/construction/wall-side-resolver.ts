import type { Floorplan, FloorplanRoom, FloorplanWall, Point2 } from '../floorplan/floorplan.types';
import { pointInPolygon } from '../floorplan/geometry-utils';
import type { WallSide, WallSideName } from './wall-assembly.types';

/** Sample points along the face, at 14–86% of its length, to dodge mitered corners. */
const SAMPLES = [0.14, 0.32, 0.5, 0.68, 0.86];
/** How far off the face the sample sits, so it lands in the room and not inside the wall. */
const SIDE_GAP_M = 0.04;

/**
 * Resolves which room (or the outside) each of a wall's two faces looks at.
 *
 * Both faces of a perimeter wall used to come back EXTERIOR whenever the interior face
 * missed every room polygon, which painted the inside of the house with the facade
 * finish. Resolution order is now: room polygons, then the building perimeter, and — only
 * if both of those tie — geometry, by which face sits further from the plan's center.
 */
export function resolveWallSides(wall: FloorplanWall, floorplan: Floorplan): { sideA: WallSide; sideB: WallSide } {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return { sideA: unknownSide('A'), sideB: unknownSide('B') };
  const normal: Point2 = [-dy / length, dx / length];

  let sideA = resolveSideRoom('A', 1, wall, floorplan.rooms, normal);
  let sideB = resolveSideRoom('B', -1, wall, floorplan.rooms, normal);

  if (!wall.isExterior) {
    // An interior face that matched no room (corridors with no Space, SVG slack) used to
    // stay UNKNOWN and get no finish mesh at all, leaving the gray core visible.
    if (sideA.environment === 'UNKNOWN' && insidePerimeter(1, wall, floorplan.outerPerimeter, normal)) {
      sideA = { ...sideA, environment: 'INTERIOR', confidence: 0.35 };
    }
    if (sideB.environment === 'UNKNOWN' && insidePerimeter(-1, wall, floorplan.outerPerimeter, normal)) {
      sideB = { ...sideB, environment: 'INTERIOR', confidence: 0.35 };
    }
    return { sideA, sideB };
  }

  if (sideA.environment === 'INTERIOR' && sideB.environment === 'UNKNOWN') {
    return { sideA, sideB: { ...sideB, environment: 'EXTERIOR', confidence: 0.98 } };
  }
  if (sideB.environment === 'INTERIOR' && sideA.environment === 'UNKNOWN') {
    return { sideA: { ...sideA, environment: 'EXTERIOR', confidence: 0.98 }, sideB };
  }
  if (sideA.environment === 'INTERIOR' && sideB.environment === 'INTERIOR') {
    return { sideA, sideB };
  }

  const insideA = insidePerimeter(1, wall, floorplan.outerPerimeter, normal);
  const insideB = insidePerimeter(-1, wall, floorplan.outerPerimeter, normal);
  if (insideA !== insideB) {
    return insideA
      ? {
          sideA: { ...sideA, environment: 'INTERIOR', confidence: 0.7 },
          sideB: { ...sideB, environment: 'EXTERIOR', confidence: 0.9 },
        }
      : {
          sideA: { ...sideA, environment: 'EXTERIOR', confidence: 0.9 },
          sideB: { ...sideB, environment: 'INTERIOR', confidence: 0.7 },
        };
  }

  const center = planCenter(floorplan);
  const offset = wall.thickness / 2 + SIDE_GAP_M;
  const mid: Point2 = [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
  const distanceA = Math.hypot(mid[0] + normal[0] * offset - center[0], mid[1] + normal[1] * offset - center[1]);
  const distanceB = Math.hypot(mid[0] - normal[0] * offset - center[0], mid[1] - normal[1] * offset - center[1]);
  return distanceA >= distanceB
    ? {
        sideA: { ...sideA, environment: 'EXTERIOR', confidence: 0.55 },
        sideB: { ...sideB, environment: 'INTERIOR', confidence: 0.55 },
      }
    : {
        sideA: { ...sideA, environment: 'INTERIOR', confidence: 0.55 },
        sideB: { ...sideB, environment: 'EXTERIOR', confidence: 0.55 },
      };
}

function planCenter(floorplan: Floorplan): Point2 {
  const points = floorplan.outerPerimeter.length >= 3
    ? floorplan.outerPerimeter
    : floorplan.walls.flatMap((wall) => [wall.start, wall.end]);
  if (points.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const [px, py] of points) {
    x += px;
    y += py;
  }
  return [x / points.length, y / points.length];
}

function resolveSideRoom(
  side: WallSideName, sign: 1 | -1, wall: FloorplanWall, rooms: FloorplanRoom[], normal: Point2,
): WallSide {
  const votes = new Map<string, number>();
  const offset = wall.thickness / 2 + SIDE_GAP_M;
  for (const t of SAMPLES) {
    const point: Point2 = [
      wall.start[0] + (wall.end[0] - wall.start[0]) * t + normal[0] * offset * sign,
      wall.start[1] + (wall.end[1] - wall.start[1]) * t + normal[1] * offset * sign,
    ];
    const room = rooms.find((candidate) => pointInPolygon(point, candidate.polygon));
    if (room) votes.set(room.id, (votes.get(room.id) ?? 0) + 1);
  }
  const winner = [...votes.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (!winner) return unknownSide(side);
  return { side, roomId: winner[0], environment: 'INTERIOR', confidence: winner[1] / SAMPLES.length };
}

function insidePerimeter(sign: 1 | -1, wall: FloorplanWall, perimeter: Point2[], normal: Point2): boolean {
  if (perimeter.length < 3) return false;
  const offset = wall.thickness / 2 + SIDE_GAP_M;
  const inside = SAMPLES.filter((t) => pointInPolygon([
    wall.start[0] + (wall.end[0] - wall.start[0]) * t + normal[0] * offset * sign,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t + normal[1] * offset * sign,
  ], perimeter)).length;
  return inside > SAMPLES.length / 2;
}

const unknownSide = (side: WallSideName): WallSide => ({ side, environment: 'UNKNOWN', confidence: 0 });

export interface WallFaceSpan extends WallSide {
  startM: number;
  endM: number;
}

/** A long wall may border several rooms. Resolve its finish per room interval. */
export function resolveWallFaceSpans(wall: FloorplanWall, floorplan: Floorplan, side: WallSide): WallFaceSpan[] {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return [];
  if (side.environment === 'EXTERIOR') return [{ ...side, startM: 0, endM: length }];
  const ux = dx / length;
  const uy = dy / length;
  const offset = (side.side === 'A' ? 1 : -1) * (wall.thickness / 2 + SIDE_GAP_M);
  const bounds = [0, length];
  for (const room of floorplan.rooms) {
    const local = room.polygon.map(([x, y]) => [
      (x - wall.start[0]) * ux + (y - wall.start[1]) * uy,
      -(x - wall.start[0]) * uy + (y - wall.start[1]) * ux,
    ]);
    for (let i = 0; i < local.length; i++) {
      const a = local[i];
      const b = local[(i + 1) % local.length];
      if ((a[1] <= offset && b[1] > offset) || (b[1] <= offset && a[1] > offset)) {
        bounds.push(Math.max(0, Math.min(length, a[0] + (b[0] - a[0]) * (offset - a[1]) / (b[1] - a[1]))));
      }
    }
  }
  bounds.sort((a, b) => a - b);
  const spans: WallFaceSpan[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const startM = bounds[i];
    const endM = bounds[i + 1];
    if (endM - startM < 1e-6) continue;
    const mid = (startM + endM) / 2;
    const point: Point2 = [wall.start[0] + ux * mid - uy * offset, wall.start[1] + uy * mid + ux * offset];
    const room = floorplan.rooms.find((candidate) => pointInPolygon(point, candidate.polygon));
    const roomId = room?.id;
    const environment = room ? 'INTERIOR' : side.environment;
    const last = spans[spans.length - 1];
    if (last && last.roomId === roomId && last.environment === environment) last.endM = endM;
    else spans.push({ ...side, roomId, environment, startM, endM });
  }
  return spans;
}
