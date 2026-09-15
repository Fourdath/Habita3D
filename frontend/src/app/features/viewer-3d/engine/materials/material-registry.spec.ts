import * as THREE from 'three';

import { MaterialRegistry } from './material-registry';

describe('MaterialRegistry', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reuses one material and one texture set for repeated requests', async () => {
    vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockImplementation(async () => new THREE.Texture());
    const registry = new MaterialRegistry(4, textureFactory);
    const first = await registry.get('NORDIC_FLOOR_WOOD_LIGHT');
    const second = await registry.get('NORDIC_FLOOR_WOOD_LIGHT');
    expect(second).toBe(first);
    expect(THREE.Loader.prototype.loadAsync).toHaveBeenCalledTimes(3);
    expect((first as THREE.MeshStandardMaterial).map?.repeat.x).toBeCloseTo(1 / 1.2);
    registry.dispose();
  });

  it('creates bathroom ceramic maps without downloading an asset', async () => {
    const load = vi.spyOn(THREE.Loader.prototype, 'loadAsync');
    const registry = new MaterialRegistry(1, textureFactory);
    const material = await registry.get('NORDIC_BATH_WALL_TILE_LIGHT') as THREE.MeshStandardMaterial;
    expect(material.map).toBeInstanceOf(THREE.Texture);
    expect(material.normalMap).toBeInstanceOf(THREE.Texture);
    expect(load).not.toHaveBeenCalled();
    registry.dispose();
  });
});


const textureFactory = () => ({ map: new THREE.Texture(), normal: new THREE.Texture(), roughness: null });
