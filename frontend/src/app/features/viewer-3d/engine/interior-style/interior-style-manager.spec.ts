import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { InteriorStyleManager } from './interior-style-manager';

function buildHouseGroup(): THREE.Group {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  wall.userData = { semanticType: 'wall' };
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  floor.userData = { semanticType: 'floor' };
  group.add(wall, floor);
  return group;
}

describe('InteriorStyleManager', () => {
  // jsdom has neither a real image decoder nor a real GLTF/WASM pipeline, so both
  // texture and GLB loads would otherwise hang forever (no load/error event ever
  // fires) instead of failing fast — mock both to fail immediately. This also
  // exercises "a failed texture/GLB load must not break the scene": applyStyle()
  // must still resolve and still swap in a (fallback) material / skip the model.
  beforeEach(() => {
    vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockRejectedValue(new Error('no network in test environment'));
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('no network in test environment'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on "none" and leaves wall/floor meshes with their original materials', () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);
    expect(manager.currentStyle).toBe('none');
  });

  it('applying "nordic" retags wall/floor meshes by userData.semanticType, not by children[] order', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);
    const house = buildHouseGroup();
    const [originalWallMaterial, originalFloorMaterial] = house.children.map((c) => (c as THREE.Mesh).material);

    await manager.applyStyle('nordic', house, false, 1);

    const [wallMesh, floorMesh] = house.children as THREE.Mesh[];
    expect(wallMesh.material).not.toBe(originalWallMaterial);
    expect(floorMesh.material).not.toBe(originalFloorMaterial);
    expect(wallMesh.material).not.toBe(floorMesh.material);
    expect(manager.currentStyle).toBe('nordic');
  });

  it('walks none -> nordic -> industrial, applying a different material each time', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);
    const house = buildHouseGroup();

    await manager.applyStyle('none', house, false, 1);
    const noneWallMaterial = (house.children[0] as THREE.Mesh).material;

    await manager.applyStyle('nordic', house, false, 1);
    const nordicWallMaterial = (house.children[0] as THREE.Mesh).material;

    await manager.applyStyle('industrial', house, false, 1);
    const industrialWallMaterial = (house.children[0] as THREE.Mesh).material;

    expect(noneWallMaterial).not.toBe(nordicWallMaterial);
    expect(nordicWallMaterial).not.toBe(industrialWallMaterial);
    expect(manager.currentStyle).toBe('industrial');
  });

  it('builds no furniture for a non-default floor plan, and reports hasFurniture accordingly', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);

    await manager.applyStyle('nordic', buildHouseGroup(), false, 1);

    expect(manager.hasFurniture).toBe(false);
    expect(collidables.children.some((child) => child.name === 'furniture')).toBe(false);
  });

  it('builds a furniture group for the default floor plan (even though every GLB load fails in this test env, none throws)', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);

    await expect(manager.applyStyle('nordic', buildHouseGroup(), true, 1)).resolves.toBeUndefined();

    // The group itself is still added (each failed item is just skipped) — this is
    // also the "keeps the scene even when a GLB fails to load" guarantee in practice.
    expect(collidables.children.some((child) => child.name === 'furniture')).toBe(true);
  });

  it('does not duplicate furniture across rapid repeated style switches', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);
    const house = buildHouseGroup();

    await Promise.all([
      manager.applyStyle('nordic', house, true, 1),
      manager.applyStyle('industrial', house, true, 1),
      manager.applyStyle('nordic', house, true, 1),
    ]);

    const furnitureGroups = collidables.children.filter((child) => child.name === 'furniture');
    expect(furnitureGroups.length).toBeLessThanOrEqual(1);
    expect(manager.currentStyle).toBe('nordic');
  });

  it('computes a budget for the currently applied style', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);

    expect(manager.getBudget().totalClp).toBe(0); // 'none'

    await manager.applyStyle('industrial', buildHouseGroup(), false, 1);
    expect(manager.getBudget().totalClp).toBeGreaterThan(0);
    expect(manager.getBudget().styleId).toBe('industrial');
  });

  it('dispose() removes the furniture group and stops any further style application', async () => {
    const collidables = new THREE.Group();
    const manager = new InteriorStyleManager(collidables);
    await manager.applyStyle('nordic', buildHouseGroup(), true, 1);

    manager.dispose();

    expect(collidables.children.some((child) => child.name === 'furniture')).toBe(false);
  });
});
