import { pointAlongWallFace } from '../construction/wall-face-geometry';
import { resolveWallFaceSpans } from '../construction/wall-side-resolver';
import type { WallConstruction } from '../construction/wall-assembly.types';
import {
  KITCHEN_RUN_MAX_GAP_M, KITCHEN_RUN_MAX_WALL_DISTANCE_M, KITCHEN_RUN_ORIENTATION_TOLERANCE_DEG,
} from './fixture.constants';
import type { FixtureType, FloorplanFixture, KitchenRun } from './fixture.types';
import type { Floorplan, FloorplanWall } from './floorplan.types';
import { distance, distanceToSegment, projectDistance } from './geometry-utils';

const RUN_FIXTURE_TYPES = new Set<FixtureType>([
  'BASE_CABINET', 'KITCHEN_SINK', 'DOUBLE_KITCHEN_SINK', 'STOVE',
]);

interface WallMountedFixture {
  fixture: FloorplanFixture;
  wall: FloorplanWall;
  wallSide: 'A' | 'B';
  startM: number;
  endM: number;
}

/**
 * Groups kitchen fixtures into countertop runs against a specific wall FACE.
 *
 * Takes the already-resolved constructions instead of recomputing them, so the run's
 * wallSide is the same side the finish and backsplash are built on.
 */
export function resolveKitchenRuns(floorplan: Floorplan, constructions: WallConstruction[]): KitchenRun[] {
  const roomsById = new Map(floorplan.rooms.map((room) => [room.id, room]));
  const mounted: WallMountedFixture[] = [];

  for (const fixture of floorplan.fixtures) {
    if (!fixture.roomId || !RUN_FIXTURE_TYPES.has(fixture.type)) continue;
    if (roomsById.get(fixture.roomId)?.semantic.type !== 'KITCHEN') continue;

    const nearest = constructions
      .flatMap((construction) => {
        const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
        if (!wall) return [];
        return [construction.sideA, construction.sideB]
          .flatMap((side) => resolveWallFaceSpans(wall, floorplan, side))
          .filter((side) => side.roomId === fixture.roomId)
          .map((side) => ({
            wall,
            wallSide: side.side,
            distance: distanceToSegment(fixture.position, wall.start, wall.end),
          }));
      })
      .filter((candidate) => candidate.distance <= KITCHEN_RUN_MAX_WALL_DISTANCE_M)
      .filter((candidate) => hasCompatibleOrientation(fixture, candidate.wall))
      .sort((left, right) => left.distance - right.distance || left.wall.id.localeCompare(right.wall.id))[0];
    if (!nearest) continue;

    const projections = fixture.footprint.map((point) => projectDistance(point, nearest.wall.start, nearest.wall.end));
    mounted.push({
      fixture,
      wall: nearest.wall,
      wallSide: nearest.wallSide,
      startM: Math.max(0, Math.min(...projections)),
      endM: Math.min(distance(nearest.wall.start, nearest.wall.end), Math.max(...projections)),
    });
  }

  const grouped = new Map<string, WallMountedFixture[]>();
  for (const item of mounted) {
    const key = `${item.fixture.roomId}|${item.wall.id}|${item.wallSide}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const runs: KitchenRun[] = [];
  for (const items of grouped.values()) {
    items.sort((left, right) => left.startM - right.startM || left.fixture.id.localeCompare(right.fixture.id));
    let current: WallMountedFixture[] = [];

    const flush = (): void => {
      if (current.length === 0) return;
      const first = current[0];
      const startM = Math.min(...current.map((item) => item.startM));
      const endM = Math.max(...current.map((item) => item.endM));
      const sign = first.wallSide === 'A' ? 1 : -1;
      runs.push({
        id: `kitchen-run_${runs.length}`,
        roomId: first.fixture.roomId ?? '',
        wallId: first.wall.id,
        wallSide: first.wallSide,
        fixtureIds: current.map((item) => item.fixture.id),
        startM,
        endM,
        start: pointAlongWallFace(first.wall, startM, sign, 0.004),
        end: pointAlongWallFace(first.wall, endM, sign, 0.004),
      });
      current = [];
    };

    for (const item of items) {
      const previousEnd = current.length > 0 ? Math.max(...current.map((entry) => entry.endM)) : -Infinity;
      if (current.length > 0 && item.startM - previousEnd > KITCHEN_RUN_MAX_GAP_M) flush();
      current.push(item);
    }
    flush();
  }
  return runs;
}

/** A fixture facing along the wall (not into it) belongs to a different run. */
function hasCompatibleOrientation(fixture: FloorplanFixture, wall: FloorplanWall): boolean {
  if (!fixture.forwardDirection) return true;
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return false;
  const normal: [number, number] = [-dy / length, dx / length];
  const alignment = Math.abs(fixture.forwardDirection[0] * normal[0] + fixture.forwardDirection[1] * normal[1]);
  return alignment >= Math.cos((KITCHEN_RUN_ORIENTATION_TOLERANCE_DEG * Math.PI) / 180);
}
