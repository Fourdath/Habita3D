import * as THREE from 'three';

import { InteriorStyleManager } from './interior-style-manager';
import type { Floorplan } from '../../../../core/floorplan/floorplan.types';

const MESH_TYPES = [
  'wall',
  'exteriorWall',
  'floor',
  'ceiling',
  'baseboard',
  'doorFrame',
  'window',
  'windowFrame',
  'lightFixture',
] as const;

function buildHouseGroup(): THREE.Group {
  const group = new THREE.Group();
  for (const semanticType of MESH_TYPES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = semanticType;
    mesh.userData = { semanticType };
    group.add(mesh);
  }
  const light = new THREE.PointLight(0xffffff, 0);
  light.name = 'roomLight';
  light.userData = { semanticType: 'roomLight', intensityScale: 0.8 };
  group.add(light);
  return group;
}

const BUDGET_PLAN: Floorplan = {
  scaleMetersPerUnit: 1,
  walls: [{ id: 'w', start: [0, 0], end: [3, 0], thickness: 0.1, isExterior: false, polygon: [[0, -0.05], [3, -0.05], [3, 0.05], [0, 0.05]] }],
  rooms: [{ id: 'r', name: 'Bedroom', type: 'Bedroom', polygon: [[0, 0], [3, 0], [3, 2], [0, 2]], semantic: { type: 'DRY', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' } }],
  doors: [],
  windows: [],
  fixtures: [],
  outerPerimeter: [[0, 0], [3, 0], [3, 2], [0, 2]],
};

describe('InteriorStyleManager', () => {
  beforeEach(() => {
    vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockRejectedValue(new Error('no network in test environment'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts on the neutral style', () => {
    expect(new InteriorStyleManager().currentStyle).toBe('none');
  });

  it('applies separate materials to every semantic architectural finish', async () => {
    const manager = new InteriorStyleManager();
    const house = buildHouseGroup();
    const original = new Map(
      house.children
        .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
        .map((mesh) => [mesh.name, mesh.material]),
    );

    await manager.applyStyle('nordic', house, 1);

    for (const semanticType of MESH_TYPES) {
      expect((house.getObjectByName(semanticType) as THREE.Mesh).material).not.toBe(original.get(semanticType));
    }
    expect((house.getObjectByName('wall') as THREE.Mesh).material).not.toBe(
      (house.getObjectByName('exteriorWall') as THREE.Mesh).material,
    );
    expect(manager.currentStyle).toBe('nordic');
  });

  it('updates room lights using the selected style palette', async () => {
    const manager = new InteriorStyleManager();
    const house = buildHouseGroup();
    const light = house.getObjectByName('roomLight') as THREE.PointLight;

    await manager.applyStyle('industrial', house, 1);

    expect(light.intensity).toBeGreaterThan(0);
    expect(light.color.getHex()).not.toBe(0xffffff);
  });

  it('resolves room surfaces and keeps industrial accents opt-in per wall side', async () => {
    const manager = new InteriorStyleManager();
    const house = new THREE.Group();
    const wallA = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    wallA.userData = { semanticType: 'wall-finish', wallId: 'w', wallSide: 'A', environment: 'INTERIOR', roomSemantic: 'DRY' };
    const wallB = wallA.clone();
    wallB.material = new THREE.MeshStandardMaterial();
    wallB.userData = { ...wallA.userData, wallSide: 'B' };
    const bathFloor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    bathFloor.userData = { semanticType: 'room-floor', roomSemantic: 'BATHROOM' };
    house.add(wallA, wallB, bathFloor);
    manager.setWallSurfaceOverrides([{ wallId: 'w', side: 'A', materialId: 'INDUSTRIAL_WALL_BRICK_EXPOSED' }]);

    await manager.applyStyle('industrial', house, 1);

    expect(wallA.material.name).toBe('INDUSTRIAL_WALL_BRICK_EXPOSED');
    expect(wallB.material.name).toBe('INDUSTRIAL_WALL_CREAM');
    expect(bathFloor.material.name).toBe('INDUSTRIAL_BATH_FLOOR_TILE_GRAY');
  });

  it('walks none -> nordic -> industrial with fresh finish materials', async () => {
    const manager = new InteriorStyleManager();
    const house = buildHouseGroup();

    await manager.applyStyle('none', house, 1);
    const noneWall = (house.getObjectByName('wall') as THREE.Mesh).material;
    await manager.applyStyle('nordic', house, 1);
    const nordicWall = (house.getObjectByName('wall') as THREE.Mesh).material;
    await manager.applyStyle('industrial', house, 1);
    const industrialWall = (house.getObjectByName('wall') as THREE.Mesh).material;

    expect(noneWall).not.toBe(nordicWall);
    expect(nordicWall).not.toBe(industrialWall);
    expect(manager.currentStyle).toBe('industrial');
  });

  it('does not create furniture for any floor plan', async () => {
    const manager = new InteriorStyleManager();
    const house = buildHouseGroup();
    await manager.applyStyle('nordic', house, 1);
    expect(house.getObjectByName('furniture')).toBeUndefined();
  });

  it('keeps only the result of the latest rapid style request', async () => {
    const manager = new InteriorStyleManager();
    const house = buildHouseGroup();
    await Promise.all([
      manager.applyStyle('nordic', house, 1),
      manager.applyStyle('industrial', house, 1),
      manager.applyStyle('nordic', house, 1),
    ]);
    expect(manager.currentStyle).toBe('nordic');
  });

  it('computes the budget for the selected style', async () => {
    const manager = new InteriorStyleManager();
    expect(manager.getBudget().totalClp).toBe(0);
    await manager.applyStyle('industrial', buildHouseGroup(), 1);
    expect(manager.getBudget(BUDGET_PLAN).totalClp).toBeGreaterThan(0);
    expect(manager.getBudget(BUDGET_PLAN).styleId).toBe('industrial');
  });

  it('can be disposed after style application', async () => {
    const manager = new InteriorStyleManager();
    await manager.applyStyle('nordic', buildHouseGroup(), 1);
    expect(() => manager.dispose()).not.toThrow();
  });
});
