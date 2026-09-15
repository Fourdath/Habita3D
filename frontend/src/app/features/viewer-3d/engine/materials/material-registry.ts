import * as THREE from 'three';

import { getMaterialDefinition } from '../../../../core/materials/material.catalog';
import type { MaterialDefinition, MaterialId } from '../../../../core/materials/material.types';
import { drawProceduralTexture } from './procedural-texture-factory';
import type { ProceduralTextureSet } from './procedural-texture-factory';

type MaterialMaps = Partial<Pick<THREE.MeshStandardMaterialParameters, 'map' | 'normalMap' | 'roughnessMap'>>;

/**
 * One THREE material instance per MaterialId, and one download per texture URL.
 *
 * Each material gets its OWN clone of a shared texture source (same GPU upload, separate
 * sampler) so its repeat = 1 / physical size cannot leak into another material that uses
 * the same image at a different scale.
 */
export class MaterialRegistry {
  private readonly materials = new Map<MaterialId, Promise<THREE.Material>>();
  private readonly textureSources = new Map<string, Promise<THREE.Texture>>();
  private readonly proceduralSources = new Map<string, ProceduralTextureSet>();
  private readonly owned = new Set<{ dispose?: () => void }>();
  private readonly maxAnisotropy: number;
  private disposed = false;

  constructor(maxAnisotropy = 1, private readonly proceduralFactory = drawProceduralTexture) {
    this.maxAnisotropy = Math.max(1, maxAnisotropy);
  }

  get(materialId: MaterialId): Promise<THREE.Material> {
    if (this.disposed) return Promise.reject(new Error('Material registry disposed'));
    let pending = this.materials.get(materialId);
    if (!pending) {
      pending = this.create(getMaterialDefinition(materialId));
      this.materials.set(materialId, pending);
    }
    return pending;
  }

  /** Resolves every material a build needs, so meshes are created with real materials. */
  async warm(materialIds: readonly MaterialId[]): Promise<Map<MaterialId, THREE.Material>> {
    const unique = [...new Set(materialIds)];
    const entries = await Promise.all(unique.map(async (id) => [id, await this.get(id)] as const));
    return new Map(entries);
  }

  private async create(definition: MaterialDefinition): Promise<THREE.Material> {
    const parameters: THREE.MeshStandardMaterialParameters = {
      color: definition.baseColor ?? 0xffffff,
      roughness: definition.roughness,
      metalness: definition.metalness,
      transparent: definition.transparent ?? false,
      opacity: definition.opacity ?? 1,
      depthWrite: !definition.transparent,
      side: definition.transparent ? THREE.DoubleSide : THREE.FrontSide,
    };
    if (definition.emissive !== undefined) {
      parameters.emissive = new THREE.Color(definition.emissive);
      parameters.emissiveIntensity = definition.emissiveIntensity ?? 1;
    }

    const maps = await this.resolveMaps(definition);
    if (this.disposed) throw new Error('Material registry disposed');
    Object.assign(parameters, maps);
    if (maps.normalMap) {
      parameters.normalScale = new THREE.Vector2(definition.normalScale ?? 1, definition.normalScale ?? 1);
    }

    const material = definition.clearcoat !== undefined
      ? new THREE.MeshPhysicalMaterial({
          ...parameters,
          clearcoat: definition.clearcoat,
          clearcoatRoughness: definition.clearcoatRoughness ?? 0.5,
        })
      : new THREE.MeshStandardMaterial(parameters);

    material.name = definition.id;
    material.userData = { materialId: definition.id, status: definition.status };
    this.owned.add(material);
    return material;
  }

  private async resolveMaps(definition: MaterialDefinition): Promise<MaterialMaps> {
    if (definition.procedural) return this.proceduralMaps(definition);
    if (!definition.maps) return {};
    try {
      const [map, normalMap, roughnessMap] = await Promise.all([
        this.loadTexture(definition.maps.albedo, THREE.SRGBColorSpace, definition),
        definition.maps.normalGl ? this.loadTexture(definition.maps.normalGl, THREE.NoColorSpace, definition) : null,
        definition.maps.roughness ? this.loadTexture(definition.maps.roughness, THREE.NoColorSpace, definition) : null,
      ]);
      const maps: MaterialMaps = { map };
      if (normalMap) maps.normalMap = normalMap;
      if (roughnessMap) maps.roughnessMap = roughnessMap;
      return maps;
    } catch (error) {
      console.warn(`No se pudo cargar ${definition.id}; se usa color plano.`, error);
      return {};
    }
  }

  private proceduralMaps(definition: MaterialDefinition): MaterialMaps {
    const key = `${definition.id}#proc`;
    let cached = this.proceduralSources.get(key);
    if (!cached) {
      cached = this.proceduralFactory(definition);
      this.owned.add(cached.map);
      if (cached.normal) this.owned.add(cached.normal);
      if (cached.roughness) this.owned.add(cached.roughness);
      this.proceduralSources.set(key, cached);
    }
    const maps: MaterialMaps = {
      map: this.finishTexture(cached.map.clone(), THREE.SRGBColorSpace, definition),
    };
    if (cached.normal) maps.normalMap = this.finishTexture(cached.normal.clone(), THREE.NoColorSpace, definition);
    if (cached.roughness) maps.roughnessMap = this.finishTexture(cached.roughness.clone(), THREE.NoColorSpace, definition);
    return maps;
  }

  private loadTexture(url: string, colorSpace: THREE.ColorSpace, definition: MaterialDefinition): Promise<THREE.Texture> {
    let pending = this.textureSources.get(url);
    if (!pending) {
      pending = new THREE.TextureLoader().loadAsync(url).then((texture) => {
        if (this.disposed) { texture.dispose(); throw new Error('Material registry disposed'); }
        this.owned.add(texture);
        return texture;
      });
      this.textureSources.set(url, pending);
    }
    return pending.then((texture) => this.finishTexture(texture.clone(), colorSpace, definition));
  }

  private finishTexture(texture: THREE.Texture, colorSpace: THREE.ColorSpace, definition: MaterialDefinition): THREE.Texture {
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const widthMeters = definition.physicalWidthMeters ?? 1;
    const heightMeters = definition.physicalHeightMeters ?? widthMeters;
    texture.repeat.set(1 / widthMeters, 1 / heightMeters);
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    this.owned.add(texture);
    return texture;
  }

  dispose(): void {
    this.disposed = true;
    for (const item of this.owned) item.dispose?.();
    this.owned.clear();
    this.materials.clear();
    this.textureSources.clear();
    this.proceduralSources.clear();
  }
}
