import * as THREE from 'three';

/**
 * Frees the GPU resources (geometry, material, textures) of every mesh under `root`.
 * Shared by Viewer3DEngine.dispose() (whole scene teardown) and FloorplanSceneManager
 * (swapping in a new floor plan) so both free resources the same way.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    for (const value of Object.values(mat)) {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    mat.dispose();
  }
}
