import * as THREE from 'three';

import type { MaterialDefinition, MaterialTextureMaps } from '../../../../core/materials/material.types';

export interface LoadedMaterialTextures {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

/** Owns exactly one texture per URL; metric UVs provide scale, so no repeat clones exist. */
export class MaterialTextureLoader {
  private readonly loader = new THREE.TextureLoader();
  private readonly cache = new Map<string, Promise<THREE.Texture>>();
  private readonly ownedTextures = new Set<THREE.Texture>();

  constructor(private readonly maxAnisotropy: number) {}

  async load(definition: MaterialDefinition): Promise<LoadedMaterialTextures> {
    if (!definition.maps) return {};
    const maps = definition.maps;
    const [map, normalMap, roughnessMap, aoMap, metalnessMap] = await Promise.all([
      this.loadMap(maps.albedo, THREE.SRGBColorSpace, definition),
      this.loadOptionalMap(maps, 'normalGl', THREE.NoColorSpace, definition),
      this.loadOptionalMap(maps, 'roughness', THREE.NoColorSpace, definition),
      this.loadOptionalMap(maps, 'ao', THREE.NoColorSpace, definition),
      this.loadOptionalMap(maps, 'metalness', THREE.NoColorSpace, definition),
    ]);
    const loaded: LoadedMaterialTextures = { map };
    if (normalMap) loaded.normalMap = normalMap;
    if (roughnessMap) loaded.roughnessMap = roughnessMap;
    if (aoMap) loaded.aoMap = aoMap;
    if (metalnessMap) loaded.metalnessMap = metalnessMap;
    return loaded;
  }

  dispose(): void {
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedTextures.clear();
    this.cache.clear();
  }

  private loadOptionalMap(
    maps: MaterialTextureMaps,
    key: keyof MaterialTextureMaps,
    colorSpace: THREE.ColorSpace,
    definition: MaterialDefinition,
  ): Promise<THREE.Texture | undefined> {
    const url = maps[key];
    return url ? this.loadMap(url, colorSpace, definition) : Promise.resolve(undefined);
  }

  private loadMap(url: string, colorSpace: THREE.ColorSpace, definition: MaterialDefinition): Promise<THREE.Texture> {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = this.loader.loadAsync(url).then((texture) => {
        texture.colorSpace = colorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(
          1 / (definition.physicalWidthMeters ?? 1),
          1 / (definition.physicalHeightMeters ?? definition.physicalWidthMeters ?? 1),
        );
        texture.anisotropy = Math.max(1, this.maxAnisotropy);
        texture.needsUpdate = true;
        this.ownedTextures.add(texture);
        return texture;
      });
      this.cache.set(url, pending);
    }
    return pending;
  }
}
