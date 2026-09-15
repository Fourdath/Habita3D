import type { FloorplanDoor, FloorplanWall } from './floorplan.types';
import { DEFAULT_DOOR_HEIGHT, MIN_DOOR_WIDTH } from './floorplan.constants';
import { distance } from './geometry-utils';

/** Viewer dimensions in metres. Normalize before cutting walls, finishes and collisions. */
export function normalizeDoors(doors: readonly FloorplanDoor[], walls: readonly FloorplanWall[]): FloorplanDoor[] {
  return walls.flatMap((wall) => {
    const length = distance(wall.start, wall.end);
    if (length < 0.01) return [];
    // Keep the opening away from end caps/corner walls when the segment permits it.
    const margin = Math.min(0.02, Math.max(0, (length - MIN_DOOR_WIDTH) / 2));
    const ux = (wall.end[0] - wall.start[0]) / length;
    const uy = (wall.end[1] - wall.start[1]) / length;
    const junctions = walls.filter((other) => other.id !== wall.id).flatMap((other) => {
      const otherLength = distance(other.start, other.end);
      if (otherLength < 0.01) return [];
      const vx = (other.end[0] - other.start[0]) / otherLength;
      const vy = (other.end[1] - other.start[1]) / otherLength;
      const cross = ux * vy - uy * vx;
      if (Math.abs(cross) < 0.3) return [];
      const dx = other.start[0] - wall.start[0], dy = other.start[1] - wall.start[1];
      const at = (dx * vy - dy * vx) / cross;
      const alongOther = (dx * uy - dy * ux) / cross;
      const reach = (wall.thickness + other.thickness) / 2 + 0.03;
      if (alongOther < -reach || alongOther > otherLength + reach || at < -reach || at > length + reach) return [];
      return [{ at, half: other.thickness / (2 * Math.abs(cross)) + 0.005 }];
    });
    const intervals = doors.filter((door) => door.wallId === wall.id).map((door) => {
      const originalCenter = door.position * length;
      let left = margin, right = length - margin;
      for (const junction of junctions) {
        if (junction.at < originalCenter) left = Math.max(left, junction.at + junction.half);
        else right = Math.min(right, junction.at - junction.half);
      }
      // Stay in the original room bay. A constrained opening must not be moved
      // through a perpendicular partition merely to force the preferred width.
      const width = Math.min(Math.max(0, right - left), Math.max(MIN_DOOR_WIDTH, door.width));
      const center = Math.max(left + width / 2, Math.min(right - width / 2, originalCenter));
      return { door, start: center - width / 2, end: center + width / 2 };
    }).filter((interval) => interval.end - interval.start > 0.01).sort((a, b) => a.start - b.start);
    const merged: typeof intervals = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end + 0.001) {
        previous.end = Math.max(previous.end, interval.end);
      } else merged.push({ ...interval });
    }
    return merged.map(({ door, start, end }) => ({
      ...door, position: (start + end) / (2 * length), width: end - start, height: DEFAULT_DOOR_HEIGHT,
    }));
  });
}
