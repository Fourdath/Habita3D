import * as THREE from 'three';
import { resolveRoomFloorMaterial } from '../../../core/materials/surface-material-resolver';
import type { FloorCategory } from '../../../core/ep2/ep2.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import type { RoomSemanticType } from '../../../core/floorplan/room-semantic.types';
import type { MaterialId } from '../../../core/materials/material.types';
import { MaterialRegistry } from './materials/material-registry';

export interface RoomFloorSelection { sceneRoomId: string; publicationKey: string; category: FloorCategory }

/** Representative category materials, never a commercial SKU texture or price calculation. */
export async function applyRoomFloorSelections(house: THREE.Group | null, selections: readonly RoomFloorSelection[], style: InteriorStyleId, registry: MaterialRegistry, isCurrent = () => true): Promise<void> {
  const byRoom = new Map(selections.map(selection => [selection.sceneRoomId, selection]));
  if (byRoom.size !== selections.length) throw new Error('Dos habitaciones están vinculadas al mismo espacio 3D. Corrige el vínculo en Mis proyectos.');
  const jobs: { mesh: THREE.Mesh; selection?: RoomFloorSelection; materialId: MaterialId }[] = [];
  house?.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData['semanticType'] !== 'room-floor') return;
    const selection = byRoom.get(object.userData['roomId'] as string);
    const materialId = selection ? (selection.category === 'ceramic' ? 'NORDIC_BATH_FLOOR_TILE_LIGHT' : 'NORDIC_FLOOR_WOOD_LIGHT')
      : resolveRoomFloorMaterial(style, (object.userData['roomSemantic'] as RoomSemanticType) ?? 'UNKNOWN');
    jobs.push({ mesh: object, selection, materialId });
  });
  const materials = await registry.warm(jobs.map(job => job.materialId));
  if (!isCurrent()) return;
  for (const { mesh, selection, materialId } of jobs) {
    mesh.material = materials.get(materialId)!;
    if (selection) mesh.userData['selectedPublicationKey'] = selection.publicationKey;
    else delete mesh.userData['selectedPublicationKey'];
  }
}
