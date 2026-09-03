import * as THREE from 'three';

import { findFurnitureCatalogEntry } from '../../../../core/interior-style/furniture-catalog';
import type {
  FurnitureCatalogEntry,
  FurniturePlacement,
  InteriorStyleId,
} from '../../../../core/interior-style/interior-style.types';

import { loadFurnitureModel } from './furniture-loader';

/** Never rendered — purely a collision proxy, so one shared instance is enough. */
const INVISIBLE_COLLIDER_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

/**
 * Loads one furniture item's GLB, normalizes it (scale + base rotation from the
 * catalog, then rests its own bounding box on the floor), and adds a simplified
 * invisible box collider sized from the catalog's dimensionsMeters — cheap and good
 * enough for "the player can't walk through a sofa/bed/table", without depending on
 * the source model's raw (and highly variable) triangle geometry for collision.
 */
async function buildFurnitureItem(entry: FurnitureCatalogEntry, placement: FurniturePlacement): Promise<THREE.Group> {
  const model = await loadFurnitureModel(entry.modelPath);

  const scale = entry.scale * (placement.scale ?? 1);
  model.rotation.y = entry.baseRotationY;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  model.position.y -= bounds.min.y; // rest the model's own lowest point on the floor (y=0)

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(entry.dimensionsMeters.width, entry.dimensionsMeters.height, entry.dimensionsMeters.depth),
    INVISIBLE_COLLIDER_MATERIAL,
  );
  collider.position.set(0, entry.dimensionsMeters.height / 2, 0);
  collider.visible = false;
  collider.userData = { semanticType: 'furniture' };

  const item = new THREE.Group();
  item.name = `furniture-${entry.id}`;
  item.add(model, collider);
  item.position.set(placement.position[0], placement.position[1], placement.position[2]);
  item.rotation.y = placement.rotationY;

  return item;
}

/**
 * Builds the whole furniture group for `styleId` from `layout`, resolving each
 * placement's category to that style's catalog entry. A placement whose category has
 * no catalog entry, or whose GLB fails to load, is skipped (logged, not thrown) —
 * one broken asset must never take down the rest of the furniture or the scene.
 */
export async function buildFurnitureLayout(
  styleId: Exclude<InteriorStyleId, 'none'>,
  layout: FurniturePlacement[],
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'furniture';

  const items = await Promise.all(
    layout.map(async (placement) => {
      const entry = findFurnitureCatalogEntry(placement.category, styleId);
      if (!entry) {
        console.error(`No hay mueble de categoría "${placement.category}" para el estilo "${styleId}".`);
        return null;
      }
      try {
        return await buildFurnitureItem(entry, placement);
      } catch (error) {
        console.error(`No se pudo cargar el mueble "${entry.id}" (${entry.modelPath}); se omite.`, error);
        return null;
      }
    }),
  );

  for (const item of items) {
    if (item) {
      group.add(item);
    }
  }

  return group;
}

/**
 * Frees a furniture group's own per-instance resources (the invisible collider boxes'
 * geometry) WITHOUT touching the GLB-sourced meshes' geometry/materials — those are
 * shared (via furniture-loader.ts's cache) with the cached original scene and any
 * other placed instance of the same model, so disposing them here would corrupt
 * everything else still using that model.
 */
export function disposeFurnitureGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && (object.userData as { semanticType?: string }).semanticType === 'furniture') {
      object.geometry.dispose();
    }
  });
}
