import * as THREE from 'three';
import { resolveRoomFloorMaterial } from '../../../core/materials/surface-material-resolver';
import type { FloorCategory } from '../../../core/ep2/ep2.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import type { RoomSemanticType } from '../../../core/floorplan/room-semantic.types';
import type { MaterialId } from '../../../core/materials/material.types';
import { FLOOR_FINISHES, type FloorFinishId } from './floor-finishes';
import { MaterialRegistry } from './materials/material-registry';
import { createTintedSurfaceMaterial, isSurfaceTint } from './materials/tinted-surface-material';

export interface RoomFloorSelection {
  sceneRoomId: string;
  publicationKey?: string;
  category?: FloorCategory;
  finishId?: FloorFinishId;
  tint?: string;
}

const tintedFloors = new WeakMap<THREE.Mesh, { base: THREE.MeshStandardMaterial; material: THREE.MeshStandardMaterial }>();

/** Applies preview finishes and tones to the floor mesh of each linked room. */
export async function applyRoomFloorSelections(house: THREE.Group | null, selections: readonly RoomFloorSelection[], style: InteriorStyleId, registry: MaterialRegistry, isCurrent = () => true): Promise<void> {
  const byRoom = new Map(selections.map(selection => [selection.sceneRoomId, selection]));
  if (byRoom.size !== selections.length) throw new Error('Dos habitaciones están vinculadas al mismo espacio 3D. Corrige el vínculo en Mis proyectos.');
  const jobs: { mesh: THREE.Mesh; selection?: RoomFloorSelection; materialId: MaterialId }[] = [];
  house?.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData['semanticType'] !== 'room-floor') return;
    const selection = byRoom.get(object.userData['roomId'] as string);
    const finish = FLOOR_FINISHES.find(item => item.id === selection?.finishId);
    const materialId = finish?.materialId ?? resolveSelectionMaterial(selection?.category, style, object.userData['roomSemantic'] as RoomSemanticType | undefined);
    jobs.push({ mesh: object, selection, materialId });
  });
  const materials = await registry.warm(jobs.map(job => job.materialId));
  if (!isCurrent()) return;
  for (const { mesh, selection, materialId } of jobs) {
    const base = materials.get(materialId)!;
    mesh.material = roomFloorMaterial(mesh, base, selection?.tint);
    if (selection?.publicationKey) mesh.userData['selectedPublicationKey'] = selection.publicationKey;
    else delete mesh.userData['selectedPublicationKey'];
  }
}

function resolveSelectionMaterial(category: FloorCategory | undefined, style: InteriorStyleId, semantic: RoomSemanticType | undefined): MaterialId {
  if (category === 'ceramic') return 'NORDIC_BATH_FLOOR_TILE_LIGHT';
  if (category === 'laminate') return 'NORDIC_FLOOR_WOOD_LIGHT';
  return resolveRoomFloorMaterial(style, semantic ?? 'UNKNOWN');
}

function roomFloorMaterial(mesh: THREE.Mesh, base: THREE.Material, tint?: string): THREE.Material {
  const previous = tintedFloors.get(mesh);
  if (base instanceof THREE.MeshStandardMaterial && isSurfaceTint(tint)) {
    const material = previous?.base === base ? previous.material : createTintedSurfaceMaterial(base);
    if (previous && previous.material !== material) previous.material.dispose();
    material.color.set(tint);
    tintedFloors.set(mesh, { base, material });
    return material;
  }
  releaseRoomFloorTint(mesh);
  return base;
}

function releaseRoomFloorTint(mesh: THREE.Mesh): void {
  tintedFloors.get(mesh)?.material.dispose();
  tintedFloors.delete(mesh);
}

/** Tinted wrappers belong to their room meshes. The registry still owns their maps. */
export function disposeRoomFloorTints(house: THREE.Group): void {
  house.traverse(object => {
    if (object instanceof THREE.Mesh) releaseRoomFloorTint(object);
  });
}
