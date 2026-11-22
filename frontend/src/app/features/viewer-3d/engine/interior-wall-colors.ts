import * as THREE from 'three';
import { createTintedSurfaceMaterial, isSurfaceTint } from './materials/tinted-surface-material';
import type { InteriorWallColors } from './viewer-3d.types';

interface WallTint {
  base: THREE.MeshStandardMaterial;
  material: THREE.MeshStandardMaterial;
}

export class InteriorWallColorPreview {
  private house: THREE.Group | null = null;
  private readonly tints = new Map<THREE.Mesh, WallTint>();

  apply(house: THREE.Group | null, colors: InteriorWallColors): void {
    if (house !== this.house) {
      this.dispose();
      this.house = house;
    }

    house?.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData['semanticType'] !== 'wall-finish' || object.userData['environment'] === 'EXTERIOR') return;
      const currentTint = this.tints.get(object);
      const base = currentTint && object.material === currentTint.material ? currentTint.base : object.material;
      const roomId = object.userData['roomId'];
      const roomColor = typeof roomId === 'string' ? colors.rooms.get(roomId) : undefined;
      const color = isSurfaceTint(roomColor) ? roomColor : colors.all;

      if (!(base instanceof THREE.MeshStandardMaterial) || !isSurfaceTint(color)) {
        if (currentTint) this.release(object, currentTint);
        return;
      }

      const tint = currentTint?.base === base ? currentTint : { base, material: createTintedSurfaceMaterial(base) };
      if (currentTint && tint !== currentTint) this.release(object, currentTint);
      tint.material.color.set(color);
      object.material = tint.material;
      this.tints.set(object, tint);
    });
  }

  dispose(): void {
    for (const [mesh, tint] of this.tints) this.release(mesh, tint);
    this.house = null;
  }

  private release(mesh: THREE.Mesh, tint: WallTint): void {
    if (mesh.material === tint.material) mesh.material = tint.base;
    tint.material.dispose();
    this.tints.delete(mesh);
  }
}
