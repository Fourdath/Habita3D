import type { Floorplan, FloorplanWall, Point2 } from '../floorplan/floorplan.types';
import { distance } from '../floorplan/geometry-utils';

const EPS = 1e-7;

/** A finishable rectangle of one wall face: elevation minus doors and windows. */
export interface WallFaceRectangle {
  id: string;
  wallId: string;
  /** Meters along the wall centerline. */
  startM: number;
  endM: number;
  /** Meters above the floor. */
  bottomM: number;
  topM: number;
  widthM: number;
  heightM: number;
}

interface OpeningRectangle {
  startM: number;
  endM: number;
  bottomM: number;
  topM: number;
}

/**
 * Splits a wall face into solid rectangles. Vertical bounds come from the openings that
 * cross each horizontal band, so the strip above a door and the strip under a window are
 * separate rectangles — the same partition the sheet and ceramic take-offs need.
 */
export function calculateWallFaceRectangles(
  floorplan: Floorplan, wall: FloorplanWall, wallHeightM: number,
): WallFaceRectangle[] {
  const length = distance(wall.start, wall.end);
  if (length <= EPS || wallHeightM <= EPS) return [];

  const openings = collectOpeningRectangles(floorplan, wall, length, wallHeightM);
  const bounds = uniqueSorted([0, length, ...openings.flatMap((opening) => [opening.startM, opening.endM])]);
  const rectangles: WallFaceRectangle[] = [];

  for (let index = 0; index < bounds.length - 1; index++) {
    const startM = bounds[index];
    const endM = bounds[index + 1];
    if (endM - startM <= EPS) continue;
    const middle = (startM + endM) / 2;
    const blocked = openings
      .filter((opening) => opening.startM < middle + EPS && opening.endM > middle - EPS)
      .map((opening): [number, number] => [opening.bottomM, opening.topM]);

    for (const [bottomM, topM] of subtractVertical(blocked, wallHeightM)) {
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

export const wallFaceNetArea = (rectangles: readonly WallFaceRectangle[]): number =>
  rectangles.reduce((sum, rectangle) => sum + rectangle.widthM * rectangle.heightM, 0);

function collectOpeningRectangles(
  floorplan: Floorplan, wall: FloorplanWall, lengthM: number, heightM: number,
): OpeningRectangle[] {
  const openings: OpeningRectangle[] = [];
  for (const door of floorplan.doors) {
    if (door.wallId !== wall.id) continue;
    const [startM, endM] = openingMeters(door.position, door.width, lengthM);
    openings.push({ startM, endM, bottomM: 0, topM: Math.min(heightM, door.height) });
  }
  for (const window of floorplan.windows) {
    if (window.wallId !== wall.id) continue;
    const [startM, endM] = openingMeters(window.position, window.width, lengthM);
    openings.push({
      startM,
      endM,
      bottomM: Math.max(0, window.sillHeight),
      topM: Math.min(heightM, window.sillHeight + window.height),
    });
  }
  return openings.filter((opening) => opening.endM - opening.startM > EPS && opening.topM - opening.bottomM > EPS);
}

/** Converts a 0..1 opening position + width into a clamped [startM, endM] span. */
export function openingMeters(position: number, width: number, lengthM: number): [number, number] {
  const center = Math.max(0, Math.min(1, position)) * lengthM;
  return [Math.max(0, center - width / 2), Math.min(lengthM, center + width / 2)];
}

function subtractVertical(intervals: Array<[number, number]>, heightM: number): Array<[number, number]> {
  const sorted = intervals
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(heightM, b)])
    .filter(([a, b]) => b - a > EPS)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const out: Array<[number, number]> = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor + EPS) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < heightM - EPS) out.push([cursor, heightM]);
  return out;
}

export function subtractIntervals(lengthM: number, exclusions: Array<[number, number]>): Array<[number, number]> {
  const sorted = exclusions
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(lengthM, b)])
    .filter(([a, b]) => b - a > EPS)
    .sort((left, right) => left[0] - right[0]);
  const out: Array<[number, number]> = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor + EPS) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < lengthM - EPS) out.push([cursor, lengthM]);
  return out;
}

/**
 * Point on a wall FACE (not its centerline), `distanceM` along the wall, offset to the
 * given side plus `extra` clearance. Side A is the +normal side, B the -normal side.
 */
export function pointAlongWallFace(
  wall: FloorplanWall, distanceM: number, sideSign: 1 | -1, extra = 0,
): Point2 {
  const length = distance(wall.start, wall.end);
  if (length < 1e-8) return [wall.start[0], wall.start[1]];
  const ux = (wall.end[0] - wall.start[0]) / length;
  const uy = (wall.end[1] - wall.start[1]) / length;
  const offset = wall.thickness / 2 + extra;
  return [
    wall.start[0] + ux * distanceM - uy * offset * sideSign,
    wall.start[1] + uy * distanceM + ux * offset * sideSign,
  ];
}

const uniqueSorted = (values: number[]): number[] => [...values]
  .sort((left, right) => left - right)
  .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > EPS);
