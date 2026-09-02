import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseFloorplan } from './cubicasa-parser';

const svgText = readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf-8');

describe('parseFloorplan', () => {
  it('parses walls, doors, windows, rooms and an outer perimeter', () => {
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: 0.01 });

    expect(floorplan.walls.length).toBeGreaterThan(0);
    expect(floorplan.doors.length).toBeGreaterThan(0);
    expect(floorplan.windows.length).toBeGreaterThan(0);
    expect(floorplan.rooms.length).toBeGreaterThan(0);
    expect(floorplan.outerPerimeter.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every wall a positive thickness and a real footprint', () => {
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: 0.01 });

    for (const wall of floorplan.walls) {
      expect(wall.thickness).toBeGreaterThan(0);
      expect(wall.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('references an existing wall from every door and window, with a normalized position', () => {
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: 0.01 });
    const wallIds = new Set(floorplan.walls.map((wall) => wall.id));

    for (const door of floorplan.doors) {
      expect(wallIds.has(door.wallId)).toBe(true);
      expect(door.position).toBeGreaterThanOrEqual(0);
      expect(door.position).toBeLessThanOrEqual(1);
      expect(door.width).toBeGreaterThan(0);
    }

    for (const windowOpening of floorplan.windows) {
      expect(wallIds.has(windowOpening.wallId)).toBe(true);
      expect(windowOpening.position).toBeGreaterThanOrEqual(0);
      expect(windowOpening.position).toBeLessThanOrEqual(1);
      expect(windowOpening.width).toBeGreaterThan(0);
    }
  });

  it('recenters the plan around the world origin so the player spawns inside it', () => {
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: 0.01 });

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of floorplan.outerPerimeter) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    expect((minX + maxX) / 2).toBeCloseTo(0, 5);
    expect((minZ + maxZ) / 2).toBeCloseTo(0, 5);
  });
});
