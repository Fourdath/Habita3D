import * as THREE from 'three';
import { resolveRoomFloorMaterial } from '../../../core/materials/surface-material-resolver';
import type { FloorCategory } from '../../../core/ep2/ep2.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import type { RoomSemanticType } from '../../../core/floorplan/room-semantic.types';
import type { MaterialId } from '../../../core/materials/material.types';
import { catalogueFloorTexture } from './catalogue-floor-texture';
import { FLOOR_FINISHES, type FloorFinishId } from './floor-finishes';
import { MaterialRegistry } from './materials/material-registry';
import { createTintedSurfaceMaterial, isSurfaceTint } from './materials/tinted-surface-material';

export interface RoomFloorSelection {
  sceneRoomId: string;
  publicationKey?: string;
  publicationName?: string;
  category?: FloorCategory;
  finishId?: FloorFinishId;
  tint?: string;
}

const tintedFloors = new WeakMap<THREE.Mesh, { base: THREE.MeshStandardMaterial; material: THREE.MeshStandardMaterial }>();
const catalogueFloors = new WeakMap<THREE.Group, Map<string, THREE.MeshStandardMaterial>>();

/** Applies preview finishes and tones to the floor mesh of each linked room. */
export async function applyRoomFloorSelections(house: THREE.Group | null, selections: readonly RoomFloorSelection[], style: InteriorStyleId, registry: MaterialRegistry, isCurrent = () => true): Promise<void> {
  if (!house) return;
  const byRoom = new Map(selections.map(selection => [selection.sceneRoomId, selection]));
  if (byRoom.size !== selections.length) throw new Error('Dos habitaciones están vinculadas al mismo espacio 3D. Corrige el vínculo en Mis proyectos.');
  const jobs: { mesh: THREE.Mesh; selection?: RoomFloorSelection; materialId: MaterialId }[] = [];
  house.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData['semanticType'] !== 'room-floor') return;
    const selection = byRoom.get(object.userData['roomId'] as string);
    const finish = FLOOR_FINISHES.find(item => item.id === selection?.finishId);
    const materialId = finish?.materialId ?? resolveSelectionMaterial(selection?.category, style, object.userData['roomSemantic'] as RoomSemanticType | undefined);
    jobs.push({ mesh: object, selection, materialId });
  });
  const materials = await registry.warm(jobs.filter(job => !job.selection?.publicationKey || !job.selection.category).map(job => job.materialId));
  if (!isCurrent()) return;
  const variants = catalogueFloors.get(house) ?? new Map<string, THREE.MeshStandardMaterial>();
  catalogueFloors.set(house, variants);
  const active = new Set<string>();
  for (const { mesh, selection, materialId } of jobs) {
    let base: THREE.Material;
    if (selection?.publicationKey && selection.category) {
      const key = JSON.stringify([selection.publicationKey, selection.category, selection.publicationName]);
      let material = variants.get(key);
      if (!material) {
        const { definition, options } = catalogueFloorTexture(selection.category, selection.publicationKey, selection.publicationName);
        material = registry.createCatalogueFloor(definition, options);
        variants.set(key, material);
      }
      active.add(key);
      base = material;
    } else {
      base = materials.get(materialId)!;
    }
    mesh.material = roomFloorMaterial(mesh, base, selection?.tint);
    if (selection?.publicationKey) mesh.userData['selectedPublicationKey'] = selection.publicationKey;
    else delete mesh.userData['selectedPublicationKey'];
  }
  for (const [key, material] of variants) {
    if (active.has(key)) continue;
    releaseCatalogueFloor(material);
    variants.delete(key);
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

function releaseCatalogueFloor(material: THREE.MeshStandardMaterial): void {
  material.map?.dispose();
  material.normalMap?.dispose();
  material.roughnessMap?.dispose();
  material.dispose();
}

/** The scene owns tinted wrappers and the generated catalogue maps. */
export function disposeRoomFloorMaterials(house: THREE.Group): void {
  house.traverse(object => {
    if (object instanceof THREE.Mesh) releaseRoomFloorTint(object);
  });
  catalogueFloors.get(house)?.forEach(releaseCatalogueFloor);
  catalogueFloors.delete(house);
}
