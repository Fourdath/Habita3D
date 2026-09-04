import * as THREE from 'three';

export interface DisposeObject3DOptions {
  /**
   * Skip disposing textures referenced by materials under `root`. Needed for anything
   * using shared/cached textures (terrain, style materials): those
   * textures are reused across floor-plan reloads and style switches, so disposing
   * them here would corrupt a texture another live material still points at. Geometry
   * and the material itself are still disposed either way.
   */
  keepTextures?: boolean;
  /** Registry-owned material wrappers must outlive individual meshes/scene rebuilds. */
  keepMaterials?: boolean;
}

/**
 * Frees the GPU resources (geometry, material, and — unless keepTextures is set —
 * textures) of every mesh under `root`. Shared by Viewer3DEngine.dispose() (whole
 * scene teardown), FloorplanSceneManager, and EnvironmentManager so everything frees
 * resources the same way.
 */
export function disposeObject3D(root: THREE.Object3D, options: DisposeObject3DOptions = {}): void {
  const keepTextures = options.keepTextures ?? false;
  const keepMaterials = options.keepMaterials ?? false;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      if (!keepMaterials) disposeMaterial(object.material, keepTextures);
    }
  });
}

/** Exported so callers holding a bare Material (already detached from any mesh) can dispose it the same way. */
export function disposeMaterial(material: THREE.Material | THREE.Material[], keepTextures = false): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    if (!keepTextures) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
    }
    mat.dispose();
  }
}
