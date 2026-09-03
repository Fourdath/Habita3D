import * as THREE from 'three';

import type { Floorplan } from '../../../../core/floorplan/floorplan.types';

import { EnvironmentManager } from './environment-manager';

function floorplanWithOuterPerimeter(points: [number, number][]): Floorplan {
  return {
    scaleMetersPerUnit: 0.01,
    walls: [],
    doors: [],
    windows: [],
    rooms: [],
    outerPerimeter: points,
  };
}

const SMALL_HOUSE = floorplanWithOuterPerimeter([
  [-2, -1.5],
  [2, -1.5],
  [2, 1.5],
  [-2, 1.5],
]);

const LARGE_HOUSE = floorplanWithOuterPerimeter([
  [-15, -5],
  [15, -5],
  [15, 5],
  [-15, 5],
]);

describe('EnvironmentManager', () => {
  // jsdom has no real image decoder / HTTP server, so THREE.TextureLoader.loadAsync
  // would otherwise hang indefinitely (no load/error event ever fires) rather than
  // reject quickly. Forcing a fast rejection here both avoids that hang and doubles
  // as a direct test of "a failed texture load must not break the scene": rebuild()
  // must still resolve and still produce correctly-sized, collidable terrain.
  beforeEach(() => {
    vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockRejectedValue(new Error('no network in test environment'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets up sky/fog/lights once at construction, independent of any floor plan', () => {
    const scene = new THREE.Scene();
    const collidables = new THREE.Group();
    new EnvironmentManager(scene, collidables);

    expect(scene.fog).not.toBeNull();
    const hasSky = scene.children.some((child) => (child as { isSky?: boolean }).isSky === true);
    const hasHemisphereLight = scene.children.some((child) => child instanceof THREE.HemisphereLight);
    const hasDirectionalLight = scene.children.some((child) => child instanceof THREE.DirectionalLight);
    expect(hasSky).toBe(true);
    expect(hasHemisphereLight).toBe(true);
    expect(hasDirectionalLight).toBe(true);
  });

  it('falls back to a flat-colored terrain material when the texture fails to load, without throwing', async () => {
    const scene = new THREE.Scene();
    const collidables = new THREE.Group();
    const environment = new EnvironmentManager(scene, collidables);

    await expect(environment.rebuild(SMALL_HOUSE, 1)).resolves.toBeDefined();

    const terrain = collidables.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh | undefined;
    expect(terrain).toBeDefined();
    expect((terrain!.material as THREE.MeshStandardMaterial).map).toBeNull();
  });

  it('adds terrain to collidables and vegetation to scene (not collidables)', async () => {
    const scene = new THREE.Scene();
    const collidables = new THREE.Group();
    const environment = new EnvironmentManager(scene, collidables);

    await environment.rebuild(SMALL_HOUSE, 1);

    const terrainInCollidables = collidables.children.some((child) => child instanceof THREE.Mesh);
    const vegetationInScene = scene.children.some((child) => child.name === 'vegetation');
    const vegetationInCollidables = collidables.children.some((child) => child.name === 'vegetation');
    expect(terrainInCollidables).toBe(true);
    expect(vegetationInScene).toBe(true);
    expect(vegetationInCollidables).toBe(false);
  });

  it('replaces the environment when rebuilt for a different (larger) floor plan', async () => {
    const scene = new THREE.Scene();
    const collidables = new THREE.Group();
    const environment = new EnvironmentManager(scene, collidables);

    await environment.rebuild(SMALL_HOUSE, 1);
    const firstTerrain = collidables.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const disposeSpy = vi.spyOn(firstTerrain.geometry, 'dispose');

    await environment.rebuild(LARGE_HOUSE, 1);

    expect(disposeSpy).toHaveBeenCalled();
    expect(collidables.children).not.toContain(firstTerrain);
    const secondTerrain = collidables.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    expect(secondTerrain).toBeDefined();
    expect(secondTerrain).not.toBe(firstTerrain);

    const firstBox = new THREE.Box3().setFromObject(firstTerrain);
    const secondBox = new THREE.Box3().setFromObject(secondTerrain);
    const firstSize = firstBox.getSize(new THREE.Vector3());
    const secondSize = secondBox.getSize(new THREE.Vector3());
    expect(secondSize.x).toBeGreaterThan(firstSize.x);
  });

  it('dispose() removes sky, lights, terrain, and vegetation, and clears scene.fog', async () => {
    const scene = new THREE.Scene();
    const collidables = new THREE.Group();
    const environment = new EnvironmentManager(scene, collidables);
    await environment.rebuild(SMALL_HOUSE, 1);

    environment.dispose();

    expect(scene.fog).toBeNull();
    expect(collidables.children.length).toBe(0);
    expect(scene.children.some((child) => child.name === 'vegetation')).toBe(false);
    expect(scene.children.some((child) => (child as { isSky?: boolean }).isSky === true)).toBe(false);
    expect(scene.children.some((child) => child instanceof THREE.HemisphereLight)).toBe(false);
    expect(scene.children.some((child) => child instanceof THREE.DirectionalLight)).toBe(false);
  });
});
