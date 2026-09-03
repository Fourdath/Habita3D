import * as THREE from 'three';

import { disposeFurnitureGroup } from './furniture-layout-builder';

describe('disposeFurnitureGroup', () => {
  it('disposes only the invisible collider geometry, never a GLB-sourced mesh (its geometry/material are cache-shared)', () => {
    const group = new THREE.Group();

    // Stands in for a loaded GLB's mesh: its geometry/material are shared (via
    // furniture-loader.ts's cache) with the cached original and any other placed
    // instance of the same model, so disposing it here would corrupt those.
    const modelMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const modelDisposeSpy = vi.spyOn(modelMesh.geometry, 'dispose');

    // Stands in for the per-instance invisible collider box built fresh for this
    // placement — its geometry is NOT shared and must be freed.
    const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    collider.userData = { semanticType: 'furniture' };
    const colliderDisposeSpy = vi.spyOn(collider.geometry, 'dispose');

    group.add(modelMesh, collider);

    disposeFurnitureGroup(group);

    expect(colliderDisposeSpy).toHaveBeenCalled();
    expect(modelDisposeSpy).not.toHaveBeenCalled();
  });

  it('does nothing for an empty group', () => {
    expect(() => disposeFurnitureGroup(new THREE.Group())).not.toThrow();
  });
});
