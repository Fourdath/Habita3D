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
