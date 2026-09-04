import type { Floorplan, FloorplanWall } from '../floorplan/floorplan.types';

const EPSILON = 1e-7;

export interface WallFaceRectangle {
  id: string;
  wallId: string;
  startM: number;
  endM: number;
  bottomM: number;
  topM: number;
  widthM: number;
  heightM: number;
}

interface OpeningRectangle { startM: number; endM: number; bottomM: number; topM: number }

/** Partitions a wall elevation into non-overlapping rectangles around all openings. */
export function calculateWallFaceRectangles(
  floorplan: Floorplan,
  wall: FloorplanWall,
  wallHeightM: number,
): WallFaceRectangle[] {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  if (length <= EPSILON || wallHeightM <= EPSILON) return [];
  const openings = collectOpeningRectangles(floorplan, wall, length, wallHeightM);
  const boundaries = uniqueSorted([0, length, ...openings.flatMap((opening) => [opening.startM, opening.endM])]);
  const rectangles: WallFaceRectangle[] = [];

  for (let stripIndex = 0; stripIndex < boundaries.length - 1; stripIndex++) {
    const startM = boundaries[stripIndex];
    const endM = boundaries[stripIndex + 1];
    if (endM - startM <= EPSILON) continue;
    const midpoint = (startM + endM) / 2;
    const blocked = openings
      .filter((opening) => opening.startM < midpoint + EPSILON && opening.endM > midpoint - EPSILON)
      .map((opening): [number, number] => [opening.bottomM, opening.topM]);
    const solids = subtractVerticalIntervals(blocked, wallHeightM);
    for (const [bottomM, topM] of solids) {
      rectangles.push({
        id: `${wall.id}_face_${rectangles.length}`,
        wallId: wall.id,
        startM,
        endM,
        bottomM,
        topM,
        widthM: endM - startM,
        heightM: topM - bottomM,
      });
    }
  }
  return rectangles;
}

export function wallFaceNetArea(rectangles: readonly WallFaceRectangle[]): number {
  return rectangles.reduce((sum, rectangle) => sum + rectangle.widthM * rectangle.heightM, 0);
}

function collectOpeningRectangles(
  floorplan: Floorplan,
  wall: FloorplanWall,
  wallLengthM: number,
  wallHeightM: number,
): OpeningRectangle[] {
  const openings: OpeningRectangle[] = [];
  for (const door of floorplan.doors) {
    if (door.wallId !== wall.id) continue;
    const [startM, endM] = openingIntervalMeters(door.position, door.width, wallLengthM);
    openings.push({ startM, endM, bottomM: 0, topM: Math.min(wallHeightM, door.height) });
  }
  for (const windowOpening of floorplan.windows) {
    if (windowOpening.wallId !== wall.id) continue;
    const [startM, endM] = openingIntervalMeters(windowOpening.position, windowOpening.width, wallLengthM);
    openings.push({
      startM,
      endM,
      bottomM: Math.max(0, windowOpening.sillHeight),
      topM: Math.min(wallHeightM, windowOpening.sillHeight + windowOpening.height),
    });
  }
  return openings.filter((opening) => opening.endM - opening.startM > EPSILON && opening.topM - opening.bottomM > EPSILON);
}

function openingIntervalMeters(position: number, width: number, wallLengthM: number): [number, number] {
  const center = Math.max(0, Math.min(1, position)) * wallLengthM;
  return [Math.max(0, center - width / 2), Math.min(wallLengthM, center + width / 2)];
}

function subtractVerticalIntervals(intervals: Array<[number, number]>, wallHeightM: number): Array<[number, number]> {
  const sorted = intervals
    .map(([start, end]): [number, number] => [Math.max(0, start), Math.min(wallHeightM, end)])
    .filter(([start, end]) => end - start > EPSILON)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const result: Array<[number, number]> = [];
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start > cursor + EPSILON) result.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < wallHeightM - EPSILON) result.push([cursor, wallHeightM]);
  return result;
}

function uniqueSorted(values: number[]): number[] {
  return [...values].sort((left, right) => left - right)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > EPSILON);
}
