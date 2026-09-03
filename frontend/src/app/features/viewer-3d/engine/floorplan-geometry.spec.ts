import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
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

function straightWall(id: string, length: number, thickness = 0.15, isExterior = true): FloorplanWall {
  const half = thickness / 2;
  return {
    id,
    start: [0, 0],
    end: [length, 0],
    thickness,
    isExterior,
    polygon: [[0, -half], [length, -half], [length, half], [0, half]],
  };
}

function childrenOfType(group: THREE.Group, semanticType: string): THREE.Object3D[] {
  return group.children.filter((child) => child.userData['semanticType'] === semanticType);
}

describe('buildFloorplanGroup', () => {
  const materials = createFloorplanMaterials();

  it('extrudes a wall and gives an exterior wall a separate facade surface', () => {
    const group = buildFloorplanGroup(emptyFloorplan({ walls: [straightWall('w1', 4)] }), materials);
    expect(childrenOfType(group, 'wall')).toHaveLength(1);
    expect(childrenOfType(group, 'exteriorWall')).toHaveLength(1);
    expect(childrenOfType(group, 'baseboard')).toHaveLength(1);
  });

  it('does not add a facade finish to an interior partition', () => {
    const group = buildFloorplanGroup(emptyFloorplan({ walls: [straightWall('w1', 4, 0.1, false)] }), materials);
    expect(childrenOfType(group, 'wall')).toHaveLength(1);
    expect(childrenOfType(group, 'exteriorWall')).toHaveLength(0);
    expect(childrenOfType(group, 'baseboard')).toHaveLength(2);
  });

  it('splits a wall around a door, leaves a walkable gap and adds open casings', () => {
    const floorplan = emptyFloorplan({
      walls: [straightWall('w1', 2)],
      doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 0.8, height: 2 }],
    });
    const group = buildFloorplanGroup(floorplan, materials);
    const wallMeshes = childrenOfType(group, 'wall') as THREE.Mesh[];

    expect(wallMeshes).toHaveLength(3);
    expect(childrenOfType(group, 'doorFrame')).toHaveLength(3);
    expect(childrenOfType(group, 'baseboard')).toHaveLength(2);

    const lintel = wallMeshes[1];
    lintel.geometry.computeBoundingBox();
    expect(lintel.geometry.boundingBox!.min.y + lintel.position.y).toBeCloseTo(2, 5);
    expect(lintel.geometry.boundingBox!.max.y + lintel.position.y).toBeCloseTo(FLOORPLAN_WALL_HEIGHT, 5);
  });

  it('adds glass, four-sided frame, mullion and sill to a wide window', () => {
    const floorplan = emptyFloorplan({
      walls: [straightWall('w1', 3)],
      windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 1.4, height: 1, sillHeight: 0.8 }],
    });
    const group = buildFloorplanGroup(floorplan, materials);
    expect(childrenOfType(group, 'wall')).toHaveLength(4);
    expect(childrenOfType(group, 'window')).toHaveLength(1);
    expect(childrenOfType(group, 'windowFrame')).toHaveLength(6);
  });

  it('generates floor, ceiling and one fixture per room', () => {
    const perimeter: [number, number][] = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
    const floorplan = emptyFloorplan({
      outerPerimeter: perimeter,
      rooms: [{ id: 'room-1', name: 'Sala', type: 'LivingRoom', polygon: perimeter }],
    });
    const group = buildFloorplanGroup(floorplan, materials);

    expect(childrenOfType(group, 'floor')).toHaveLength(1);
    expect(childrenOfType(group, 'ceiling')).toHaveLength(1);
    expect(childrenOfType(group, 'lightFixture')).toHaveLength(1);
    expect(childrenOfType(group, 'roomLight')).toHaveLength(1);

    const floor = childrenOfType(group, 'floor')[0] as THREE.Mesh;
    floor.geometry.computeBoundingBox();
    expect(floor.geometry.boundingBox!.max.y + floor.position.y).toBeCloseTo(0, 5);
    const ceiling = childrenOfType(group, 'ceiling')[0] as THREE.Mesh;
    ceiling.geometry.computeBoundingBox();
    expect(ceiling.geometry.boundingBox!.min.y + ceiling.position.y).toBeCloseTo(FLOORPLAN_WALL_HEIGHT, 5);
  });

  it('caps real point lights while retaining a visible fixture for every room', () => {
    const rooms = Array.from({ length: 15 }, (_, index) => ({
      id: `room-${index}`,
      name: 'Habitación',
      type: 'Bedroom',
      polygon: [[index * 2, 0], [index * 2 + 1, 0], [index * 2 + 1, 1], [index * 2, 1]] as [number, number][],
    }));
    const group = buildFloorplanGroup(emptyFloorplan({ rooms }), materials);
    expect(childrenOfType(group, 'lightFixture')).toHaveLength(15);
    expect(childrenOfType(group, 'roomLight')).toHaveLength(12);
  });

  it('builds every architectural finish for the bundled CubiCasa plan', () => {
    const svgText = readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf8');
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: 0.01 });
    const group = buildFloorplanGroup(floorplan, materials);

    for (const semanticType of [
      'wall',
      'exteriorWall',
      'floor',
      'ceiling',
      'baseboard',
      'doorFrame',
      'window',
      'windowFrame',
      'lightFixture',
      'roomLight',
    ]) {
      expect(childrenOfType(group, semanticType).length, semanticType).toBeGreaterThan(0);
    }
  });

  it('produces no objects for an entirely empty floorplan', () => {
    expect(buildFloorplanGroup(emptyFloorplan(), materials).children).toHaveLength(0);
  });
});
