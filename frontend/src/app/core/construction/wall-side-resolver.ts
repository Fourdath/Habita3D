import type { Floorplan, FloorplanRoom, FloorplanWall, Point2 } from '../floorplan/floorplan.types';
import { pointInPolygon } from '../floorplan/geometry-utils';
import type { WallSide, WallSideName } from './wall-assembly.types';

const SAMPLE_POSITIONS = [0.14, 0.32, 0.5, 0.68, 0.86];
const SIDE_SAMPLE_GAP_M = 0.04;

export function resolveWallSides(wall: FloorplanWall, floorplan: Floorplan): { sideA: WallSide; sideB: WallSide } {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return { sideA: unknownSide('A'), sideB: unknownSide('B') };

  const normal: Point2 = [-dy / length, dx / length];
  const sideA = resolveSideRoom('A', 1, wall, floorplan.rooms, normal);
  const sideB = resolveSideRoom('B', -1, wall, floorplan.rooms, normal);
  if (!wall.isExterior) return { sideA, sideB };
  if (sideA.environment === 'INTERIOR' && sideB.environment === 'UNKNOWN') {
    return { sideA, sideB: { ...sideB, environment: 'EXTERIOR', confidence: 0.98 } };
  }
  if (sideB.environment === 'INTERIOR' && sideA.environment === 'UNKNOWN') {
    return { sideA: { ...sideA, environment: 'EXTERIOR', confidence: 0.98 }, sideB };
  }

  const perimeterA = perimeterVote(1, wall, floorplan.outerPerimeter, normal);
  const perimeterB = perimeterVote(-1, wall, floorplan.outerPerimeter, normal);
  if (perimeterA !== perimeterB) {
    return perimeterA
      ? { sideA: { ...sideA, environment: 'INTERIOR', confidence: 0.7 }, sideB: { ...sideB, environment: 'EXTERIOR', confidence: 0.9 } }
      : { sideA: { ...sideA, environment: 'EXTERIOR', confidence: 0.9 }, sideB: { ...sideB, environment: 'INTERIOR', confidence: 0.7 } };
  }

  // CubiCasa still proves this is an exterior wall, but cannot prove which face in
  // a plan without rooms/perimeter. Keep that uncertainty instead of claiming both.
  return { sideA: { ...sideA, environment: 'EXTERIOR', confidence: 0.5 }, sideB };
}

function resolveSideRoom(
  side: WallSideName,
  sign: number,
  wall: FloorplanWall,
  rooms: FloorplanRoom[],
  normal: Point2,
): WallSide {
  const roomVotes = new Map<string, number>();
  const distance = wall.thickness / 2 + SIDE_SAMPLE_GAP_M;
  for (const t of SAMPLE_POSITIONS) {
    const point: Point2 = [
      wall.start[0] + (wall.end[0] - wall.start[0]) * t + normal[0] * distance * sign,
      wall.start[1] + (wall.end[1] - wall.start[1]) * t + normal[1] * distance * sign,
    ];
    const room = rooms.find((candidate) => pointInPolygon(point, candidate.polygon, 1e-5));
    if (room) roomVotes.set(room.id, (roomVotes.get(room.id) ?? 0) + 1);
  }

  const winner = [...roomVotes.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (winner) {
    return { side, roomId: winner[0], environment: 'INTERIOR', confidence: winner[1] / SAMPLE_POSITIONS.length };
  }
  return unknownSide(side);
}

function perimeterVote(sign: number, wall: FloorplanWall, perimeter: Point2[], normal: Point2): boolean {
  if (perimeter.length < 3) return false;
  const distance = wall.thickness / 2 + SIDE_SAMPLE_GAP_M;
  const insideVotes = SAMPLE_POSITIONS.filter((t) => pointInPolygon([
    wall.start[0] + (wall.end[0] - wall.start[0]) * t + normal[0] * distance * sign,
    wall.start[1] + (wall.end[1] - wall.start[1]) * t + normal[1] * distance * sign,
  ], perimeter, 1e-5)).length;
  return insideVotes > SAMPLE_POSITIONS.length / 2;
}

function unknownSide(side: WallSideName): WallSide {
  return { side, environment: 'UNKNOWN', confidence: 0 };
}
