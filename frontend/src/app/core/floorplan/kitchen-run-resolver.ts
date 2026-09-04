import type { WallSideName } from '../construction/wall-assembly.types';
import { resolveAllWallConstructions } from '../construction/wall-construction-resolver';
import type { FloorplanFixture, KitchenRun } from './fixture.types';
import type { Floorplan, FloorplanWall, Point2 } from './floorplan.types';
import {
  KITCHEN_RUN_MAX_GAP_M,
  KITCHEN_RUN_MAX_WALL_DISTANCE_M,
  KITCHEN_RUN_ORIENTATION_TOLERANCE_DEG,
} from './fixture.constants';

const RUN_FIXTURE_TYPES = new Set([
  'BASE_CABINET',
  'WALL_CABINET',
  'KITCHEN_SINK',
  'DOUBLE_KITCHEN_SINK',
  'STOVE',
  'REFRIGERATOR',
  'WASHING_MACHINE',
  'APPLIANCE_SPACE',
]);

interface WallFixture {
  fixture: FloorplanFixture;
  wall: FloorplanWall;
  wallSide: WallSideName;
  startM: number;
  endM: number;
}

/** Groups only parsed kitchen fixtures; it never creates missing modules. */
export function resolveKitchenRuns(floorplan: Floorplan): KitchenRun[] {
  const constructions = resolveAllWallConstructions(floorplan);
  const wallFixtures: WallFixture[] = [];

  for (const fixture of floorplan.fixtures) {
    if (!fixture.roomId || !RUN_FIXTURE_TYPES.has(fixture.type)) continue;
    const room = floorplan.rooms.find((candidate) => candidate.id === fixture.roomId);
    if (room?.semantic.type !== 'KITCHEN') continue;

    const candidates = constructions.flatMap((construction) => {
      const wall = floorplan.walls.find((candidate) => candidate.id === construction.wallId);
      if (!wall) return [];
      const sides = [construction.sideA, construction.sideB]
        .filter((side) => side.roomId === fixture.roomId);
      return sides.map((side) => ({ wall, wallSide: side.side, distance: distanceToSegment(fixture.position, wall.start, wall.end) }));
    }).filter((candidate) => candidate.distance <= KITCHEN_RUN_MAX_WALL_DISTANCE_M)
      .filter((candidate) => hasCompatibleOrientation(fixture, candidate.wall))
      .sort((left, right) => left.distance - right.distance || left.wall.id.localeCompare(right.wall.id));

    const nearest = candidates[0];
    if (!nearest) continue;
    const projections = fixture.footprint.map((point) => projectDistance(point, nearest.wall));
    wallFixtures.push({
      fixture,
      wall: nearest.wall,
      wallSide: nearest.wallSide,
      startM: Math.max(0, Math.min(...projections)),
      endM: Math.min(wallLength(nearest.wall), Math.max(...projections)),
    });
  }

  const grouped = new Map<string, WallFixture[]>();
  for (const item of wallFixtures) {
    const key = `${item.fixture.roomId}|${item.wall.id}|${item.wallSide}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const runs: KitchenRun[] = [];
  for (const items of grouped.values()) {
    items.sort((left, right) => left.startM - right.startM || left.fixture.id.localeCompare(right.fixture.id));
    let current: WallFixture[] = [];
    const flush = (): void => {
      if (current.length === 0) return;
      const first = current[0];
      const startM = Math.min(...current.map((item) => item.startM));
      const endM = Math.max(...current.map((item) => item.endM));
      const sideSign = first.wallSide === 'A' ? 1 : -1;
      runs.push({
        id: `kitchen-run_${runs.length}`,
        roomId: first.fixture.roomId!,
        wallId: first.wall.id,
        wallSide: first.wallSide,
        fixtureIds: current.map((item) => item.fixture.id),
        start: pointAlongWallFace(first.wall, startM, sideSign),
        end: pointAlongWallFace(first.wall, endM, sideSign),
      });
      current = [];
    };

    for (const item of items) {
      const previousEnd = current.length > 0 ? Math.max(...current.map((candidate) => candidate.endM)) : -Infinity;
      if (current.length > 0 && item.startM - previousEnd > KITCHEN_RUN_MAX_GAP_M) flush();
      current.push(item);
    }
    flush();
  }
  return runs;
}

function hasCompatibleOrientation(fixture: FloorplanFixture, wall: FloorplanWall): boolean {
  if (!fixture.forwardDirection) return true;
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return false;
  const normal: Point2 = [-dy / length, dx / length];
  const alignment = Math.abs(fixture.forwardDirection[0] * normal[0] + fixture.forwardDirection[1] * normal[1]);
  return alignment >= Math.cos((KITCHEN_RUN_ORIENTATION_TOLERANCE_DEG * Math.PI) / 180);
}

function wallLength(wall: FloorplanWall): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

function projectDistance(point: Point2, wall: FloorplanWall): number {
  const length = wallLength(wall);
  if (length < 1e-8) return 0;
  return ((point[0] - wall.start[0]) * (wall.end[0] - wall.start[0])
    + (point[1] - wall.start[1]) * (wall.end[1] - wall.start[1])) / length;
}

function distanceToSegment(point: Point2, start: Point2, end: Point2): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-8
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - start[0] - dx * t, point[1] - start[1] - dy * t);
}

function pointAlongWallFace(wall: FloorplanWall, distanceM: number, sideSign: number): Point2 {
  const length = wallLength(wall);
  const ux = (wall.end[0] - wall.start[0]) / length;
  const uy = (wall.end[1] - wall.start[1]) / length;
  const offset = wall.thickness / 2 + 0.004;
  return [wall.start[0] + ux * distanceM - uy * offset * sideSign, wall.start[1] + uy * distanceM + ux * offset * sideSign];
}
