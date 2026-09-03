import * as THREE from 'three';

import { InteriorStyleManager } from './interior-style-manager';

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
    expect(manager.getBudget().totalClp).toBeGreaterThan(0);
    expect(manager.getBudget().styleId).toBe('industrial');
  });

  it('can be disposed after style application', async () => {
    const manager = new InteriorStyleManager();
    await manager.applyStyle('nordic', buildHouseGroup(), 1);
    expect(() => manager.dispose()).not.toThrow();
  });
});
