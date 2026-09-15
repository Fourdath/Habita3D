import type { Floorplan, Point2 } from './floorplan.types';
import { distanceToSegment, pointInPolygon, polygonArea, polygonCentroid } from './geometry-utils';

/** Find a clear point inside a room instead of spawning in a wall at the SVG origin. */
export function resolveFloorplanSpawn(plan: Floorplan, radius: number): Point2 {
  const rooms = [...plan.rooms].sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon));
  for (const room of rooms) {
    if (room.polygon.length < 3) continue;
    const xs = room.polygon.map((point) => point[0]);
    const ys = room.polygon.map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const candidates = [polygonCentroid(room.polygon)];
    for (let x = 1; x < 12; x++) for (let y = 1; y < 12; y++) {
      candidates.push([minX + (maxX - minX) * x / 12, minY + (maxY - minY) * y / 12]);
    }
    let best: Point2 | undefined;
    let clearance = radius + 0.1;
    for (const point of candidates) {
      if (!pointInPolygon(point, room.polygon)) continue;
      if (plan.fixtures.some((fixture) => pointInPolygon(point, fixture.footprint))) continue;
      const distances = room.polygon.map((a, i) => distanceToSegment(point, a, room.polygon[(i + 1) % room.polygon.length]));
      distances.push(...plan.walls.map((wall) => distanceToSegment(point, wall.start, wall.end) - wall.thickness / 2));
      for (const fixture of plan.fixtures) {
        distances.push(...fixture.footprint.map((a, i) => distanceToSegment(point, a, fixture.footprint[(i + 1) % fixture.footprint.length])));
      }
      const available = Math.min(...distances);
      if (available > clearance) { clearance = available; best = point; }
    }
    if (best) return best;
  }
  return [0, 0];
}
