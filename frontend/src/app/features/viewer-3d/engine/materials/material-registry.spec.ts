import * as THREE from 'three';

import { MaterialRegistry } from './material-registry';

describe('MaterialRegistry', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reuses one material and one texture set for repeated requests', async () => {
    vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockImplementation(async () => new THREE.Texture());
    const registry = new MaterialRegistry(4);
    const first = await registry.get('NORDIC_FLOOR_WOOD_LIGHT');
    const second = await registry.get('NORDIC_FLOOR_WOOD_LIGHT');
    expect(second).toBe(first);
    expect(THREE.Loader.prototype.loadAsync).toHaveBeenCalledTimes(3);
    expect((first as THREE.MeshStandardMaterial).map?.repeat.x).toBeCloseTo(1 / 1.2);
    registry.dispose();
  });

  it('uses explicit flat fallback for pending assets without loading a URL', async () => {
    const load = vi.spyOn(THREE.Loader.prototype, 'loadAsync');
    const registry = new MaterialRegistry();
    const material = await registry.get('NORDIC_BATH_WALL_TILE_LIGHT') as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0xf3f4f2);
    expect(load).not.toHaveBeenCalled();
    registry.dispose();
  });
});
