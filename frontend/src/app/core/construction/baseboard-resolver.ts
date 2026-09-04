import type { WallConstruction } from './wall-assembly.types';
import type { Floorplan, FloorplanWall, Point2 } from '../floorplan/floorplan.types';

const EPSILON = 1e-7;
const BASEBOARD_OCCUPYING_FIXTURES = new Set(['BASE_CABINET', 'REFRIGERATOR', 'WASHING_MACHINE', 'APPLIANCE_SPACE']);

export interface BaseboardSegment {
  id: string;
  roomId: string;
  wallId: string;
  wallSide: 'A' | 'B';
  start: Point2;
  end: Point2;
  lengthM: number;
}

/** Resolves physical dry-room runs, excluding doors and fixed floor cabinetry/appliance bays. */
export function resolveBaseboardSegments(
  floorplan: Floorplan,
  constructions: readonly WallConstruction[],
): BaseboardSegment[] {
  const rooms = new Map(floorplan.rooms.map((room) => [room.id, room]));
  const segments: BaseboardSegment[] = [];
  for (const construction of constructions) {
    const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
    if (!wall) continue;
    const length = wallLength(wall);
    if (length <= EPSILON) continue;

    for (const side of [construction.sideA, construction.sideB]) {
      if (!side.roomId || rooms.get(side.roomId)?.semantic.type !== 'DRY') continue;
      const exclusions: Array<[number, number]> = floorplan.doors
        .filter((door) => door.wallId === wall.id)
        .map((door) => [door.position * length - door.width / 2, door.position * length + door.width / 2]);
      for (const fixture of floorplan.fixtures) {
        if (fixture.roomId !== side.roomId || !BASEBOARD_OCCUPYING_FIXTURES.has(fixture.type)) continue;
        if (distanceToLine(fixture.position, wall) > wall.thickness / 2 + fixture.depth + 0.12) continue;
        const projections = fixture.footprint.map((point) => projectDistance(point, wall));
        exclusions.push([Math.min(...projections), Math.max(...projections)]);
      }

      for (const [startM, endM] of subtractIntervals(length, exclusions)) {
        const sideSign = side.side === 'A' ? 1 : -1;
        segments.push({
          id: `baseboard_${wall.id}_${side.side}_${segments.length}`,
          roomId: side.roomId,
          wallId: wall.id,
          wallSide: side.side,
          start: pointAlongWallFace(wall, startM, sideSign),
          end: pointAlongWallFace(wall, endM, sideSign),
          lengthM: endM - startM,
        });
      }
    }
  }
  return segments;
}

function subtractIntervals(length: number, exclusions: Array<[number, number]>): Array<[number, number]> {
  const sorted = exclusions.map(([start, end]): [number, number] => [Math.max(0, start), Math.min(length, end)])
    .filter(([start, end]) => end - start > EPSILON)
    .sort((left, right) => left[0] - right[0]);
  const result: Array<[number, number]> = [];
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start > cursor + EPSILON) result.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < length - EPSILON) result.push([cursor, length]);
  return result;
}

function pointAlongWallFace(wall: FloorplanWall, distanceM: number, sideSign: number): Point2 {
  const length = wallLength(wall);
  const ux = (wall.end[0] - wall.start[0]) / length;
  const uy = (wall.end[1] - wall.start[1]) / length;
  const offset = wall.thickness / 2 + 0.012;
  return [wall.start[0] + ux * distanceM - uy * offset * sideSign, wall.start[1] + uy * distanceM + ux * offset * sideSign];
}

function projectDistance(point: Point2, wall: FloorplanWall): number {
  const length = wallLength(wall);
  return ((point[0] - wall.start[0]) * (wall.end[0] - wall.start[0])
    + (point[1] - wall.start[1]) * (wall.end[1] - wall.start[1])) / length;
}

function distanceToLine(point: Point2, wall: FloorplanWall): number {
  const length = wallLength(wall);
  return Math.abs((point[0] - wall.start[0]) * (wall.end[1] - wall.start[1])
    - (point[1] - wall.start[1]) * (wall.end[0] - wall.start[0])) / length;
}

function wallLength(wall: FloorplanWall): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}
