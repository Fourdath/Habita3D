import * as THREE from 'three';

import { getMaterialDefinition } from '../../../../core/materials/material.catalog';
import type { MaterialDefinition, MaterialId } from '../../../../core/materials/material.types';
import { MaterialTextureLoader } from './material-texture-loader';

/** Engine-level owner of shared material wrappers and their one-per-URL textures. */
export class MaterialRegistry {
  private readonly textureLoader: MaterialTextureLoader;
  private readonly materials = new Map<MaterialId, Promise<THREE.Material>>();
  private readonly ownedMaterials = new Set<THREE.Material>();

  constructor(maxAnisotropy = 1) {
    this.textureLoader = new MaterialTextureLoader(maxAnisotropy);
  }

  get(materialId: MaterialId): Promise<THREE.Material> {
    let pending = this.materials.get(materialId);
    if (!pending) {
      const definition = getMaterialDefinition(materialId);
      pending = this.create(definition);
      this.materials.set(materialId, pending);
    }
    return pending;
  }

  dispose(): void {
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
    this.materials.clear();
    this.textureLoader.dispose();
  }

  private async create(definition: MaterialDefinition): Promise<THREE.Material> {
    let textureParameters = {};
    if (definition.maps && definition.status === 'READY') {
      try {
        textureParameters = await this.textureLoader.load(definition);
      } catch (error) {
        console.error(`No se pudo cargar ${definition.id}; se usa su fallback PBR plano.`, error);
      }
    }

    const parameters: THREE.MeshStandardMaterialParameters = {
      ...textureParameters,
      color: definition.baseColor ?? 0xffffff,
      roughness: definition.roughness,
      metalness: definition.metalness,
      normalScale: new THREE.Vector2(definition.normalScale ?? 1, definition.normalScale ?? 1),
      transparent: definition.transparent ?? false,
      opacity: definition.opacity ?? 1,
      depthWrite: !definition.transparent,
      side: definition.transparent ? THREE.DoubleSide : THREE.FrontSide,
    };
    const material = definition.clearcoat !== undefined
      ? new THREE.MeshPhysicalMaterial({
          ...parameters,
          clearcoat: definition.clearcoat,
          clearcoatRoughness: definition.clearcoatRoughness ?? 0.5,
        })
      : new THREE.MeshStandardMaterial(parameters);
    material.name = definition.id;
    material.userData = { materialId: definition.id, status: definition.status };
    this.ownedMaterials.add(material);
    return material;
  }
}
