import * as THREE from 'three';

import type { Floorplan, FloorplanWall } from '../../../core/floorplan/floorplan.types';

import { buildFloorplanGroup, createFloorplanMaterials } from './floorplan-geometry';
import { FLOORPLAN_WALL_HEIGHT } from './viewer-3d.constants';

function emptyFloorplan(overrides: Partial<Floorplan> = {}): Floorplan {
  return {
    scaleMetersPerUnit: 0.01,
    walls: [],
    doors: [],
    windows: [],
    rooms: [],
    outerPerimeter: [],
    ...overrides,
  };
}

function straightWall(id: string, length: number, thickness = 0.2): FloorplanWall {
  const half = thickness / 2;
  return {
    id,
    start: [0, 0],
    end: [length, 0],
    thickness,
    isExterior: true,
    polygon: [
      [0, -half],
      [length, -half],
      [length, half],
      [0, half],
    ],
  };
}

function meshTypes(group: THREE.Group): string[] {
  return group.children.map((child) => (child.userData as { semanticType: string }).semanticType);
}

describe('buildFloorplanGroup', () => {
  const materials = createFloorplanMaterials();

  it('extrudes a wall with no openings as a single mesh using its raw polygon', () => {
    const wall = straightWall('w1', 4);
    const group = buildFloorplanGroup(emptyFloorplan({ walls: [wall] }), materials);

    expect(meshTypes(group)).toEqual(['wall']);
  });

  it('splits a wall around a door into solid segments plus a lintel, leaving a real gap', () => {
    const wall = straightWall('w1', 2);
    const floorplan = emptyFloorplan({
      walls: [wall],
      doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 0.8, height: 2.0 }],
    });

    const group = buildFloorplanGroup(floorplan, materials);

    expect(meshTypes(group)).toEqual(['wall', 'wall', 'wall']);

    // The opening segment (the lintel piece, still tagged 'wall') must not reach down to the floor.
    const lintel = group.children[1] as THREE.Mesh;
    const geometry = lintel.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.y + lintel.position.y).toBeCloseTo(2.0, 5);
    expect(box.max.y + lintel.position.y).toBeCloseTo(FLOORPLAN_WALL_HEIGHT, 5);
  });

  it('splits a wall around a window into solid, sill, lintel, solid', () => {
    const wall = straightWall('w1', 2);
    const floorplan = emptyFloorplan({
      walls: [wall],
      windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 0.8, height: 1.0, sillHeight: 0.8 }],
    });

    const group = buildFloorplanGroup(floorplan, materials);

    expect(meshTypes(group)).toEqual(['wall', 'wall', 'wall', 'wall']);
  });

  it('generates a floor mesh from the outer perimeter, top surface at y=0', () => {
    const floorplan = emptyFloorplan({
      outerPerimeter: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
    });

    const group = buildFloorplanGroup(floorplan, materials);

    expect(meshTypes(group)).toEqual(['floor']);

    const floor = group.children[0] as THREE.Mesh;
    floor.geometry.computeBoundingBox();
    const box = floor.geometry.boundingBox!;
    expect(box.max.y + floor.position.y).toBeCloseTo(0, 5);
    expect(box.min.y + floor.position.y).toBeLessThan(0);
  });

  it('produces no meshes for an entirely empty floorplan', () => {
    const group = buildFloorplanGroup(emptyFloorplan(), materials);
    expect(group.children.length).toBe(0);
  });
});
