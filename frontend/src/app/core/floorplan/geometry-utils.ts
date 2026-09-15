import type { Point2 } from './floorplan.types';

export function pointInPolygon(point: Point2, polygon: Point2[], tolerance = 1e-7): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const cross = (point[0] - xi) * (yj - yi) - (point[1] - yi) * (xj - xi);
    const dot = (point[0] - xi) * (point[0] - xj) + (point[1] - yi) * (point[1] - yj);
    if (Math.abs(cross) <= tolerance && dot <= tolerance) return true;
    const intersects = yi > point[1] !== yj > point[1]
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonArea(polygon: Point2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

export function polygonCenter(polygon: Point2[]): Point2 {
  if (polygon.length === 0) return [0, 0];
  return [
    polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
    polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
  ];
}

/** Area centroid: room lights and labels must not drift on L-shaped rooms. */
export function polygonCentroid(polygon: Point2[]): Point2 {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) return polygonCenter(polygon);
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

export const subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];

export const distance = (a: Point2, b: Point2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function normalizeDirection(vector: Point2): Point2 {
  const length = Math.hypot(vector[0], vector[1]);
  return length > 1e-8 ? [vector[0] / length, vector[1] / length] : [1, 0];
}

/** Clamped 0..1 parameter of the projection of `point` onto segment a-b. */
export function projectT(point: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-8) return 0.5;
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared;
  return Math.max(0, Math.min(1, t));
}

/** Signed distance in meters along the wall centerline from its start point. */
export function projectDistance(point: Point2, start: Point2, end: Point2): number {
  const length = distance(start, end);
  if (length < 1e-8) return 0;
  return ((point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])) / length;
}

export function distanceToSegment(point: Point2, start: Point2, end: Point2): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-8
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - start[0] - dx * t, point[1] - start[1] - dy * t);
}

export function distanceToLine(point: Point2, start: Point2, end: Point2): number {
  const length = distance(start, end);
  if (length < 1e-8) return Infinity;
  const cross = (point[0] - start[0]) * (end[1] - start[1]) - (point[1] - start[1]) * (end[0] - start[0]);
  return Math.abs(cross) / length;
}

export function parsePointsAttribute(attribute: string): Point2[] {
  return attribute.trim().split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((values): values is [number, number] => values.length >= 2
      && Number.isFinite(values[0]) && Number.isFinite(values[1]))
    .map(([x, y]) => [x, y] as Point2);
}

/** Drops a trailing point that repeats the first one (closed SVG polygons). */
export function dedupeClosingPoint(points: Point2[]): Point2[] {
  if (points.length > 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(last[0] - first[0]) < 0.01 && Math.abs(last[1] - first[1]) < 0.01) {
      return points.slice(0, -1);
    }
  }
  return points;
}
