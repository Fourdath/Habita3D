import type { FixtureType } from '../floorplan/fixture.types';
import type { Floorplan, Point2 } from '../floorplan/floorplan.types';
import { distance, distanceToLine, projectDistance } from '../floorplan/geometry-utils';
import type { WallConstruction, WallSideName } from './wall-assembly.types';
import { pointAlongWallFace, subtractIntervals } from './wall-face-geometry';
import { resolveWallFaceSpans } from './wall-side-resolver';

const EPS = 1e-7;
/** Cabinetry and appliances stand where the baseboard would run. */
const BASEBOARD_OCCUPYING = new Set<FixtureType>([
  'BASE_CABINET', 'REFRIGERATOR', 'WASHING_MACHINE', 'APPLIANCE_SPACE',
]);

export interface BaseboardSegment {
  id: string;
  roomId: string;
  wallId: string;
  wallSide: WallSideName;
  start: Point2;
  end: Point2;
  lengthM: number;
}

/**
 * Baseboard runs per wall FACE, in dry rooms only (bathroom and kitchen get a different
 * trim), minus door openings and minus the footprint of anything standing against it.
 */
export function resolveBaseboardSegments(
  floorplan: Floorplan, constructions: readonly WallConstruction[],
): BaseboardSegment[] {
  const roomsById = new Map(floorplan.rooms.map((room) => [room.id, room]));
  const segments: BaseboardSegment[] = [];

  for (const construction of constructions) {
    const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
    if (!wall) continue;
    const length = distance(wall.start, wall.end);
    if (length <= EPS) continue;

    for (const side of [construction.sideA, construction.sideB].flatMap((face) => resolveWallFaceSpans(wall, floorplan, face))) {
      if (!side.roomId || roomsById.get(side.roomId)?.semantic.type !== 'DRY') continue;

      const exclusions: Array<[number, number]> = floorplan.doors
        .filter((door) => door.wallId === wall.id)
        .map((door) => [door.position * length - door.width / 2, door.position * length + door.width / 2]);
      exclusions.push([0, side.startM], [side.endM, length]);

      for (const fixture of floorplan.fixtures) {
        if (fixture.roomId !== side.roomId || !BASEBOARD_OCCUPYING.has(fixture.type)) continue;
        if (distanceToLine(fixture.position, wall.start, wall.end) > wall.thickness / 2 + fixture.depth + 0.12) continue;
        const projections = fixture.footprint.map((point) => projectDistance(point, wall.start, wall.end));
        exclusions.push([Math.min(...projections), Math.max(...projections)]);
      }

      for (const [startM, endM] of subtractIntervals(length, exclusions)) {
        const sign: 1 | -1 = side.side === 'A' ? 1 : -1;
        segments.push({
          id: `baseboard_${wall.id}_${side.side}_${segments.length}`,
          roomId: side.roomId,
          wallId: wall.id,
          wallSide: side.side,
          start: pointAlongWallFace(wall, startM, sign, 0.012),
          end: pointAlongWallFace(wall, endM, sign, 0.012),
          lengthM: endM - startM,
        });
      }
    }
  }
  return segments;
}
