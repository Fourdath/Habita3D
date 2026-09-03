import * as THREE from 'three';

import { computeBudget, type BudgetSummary } from '../../../../core/interior-style/budget-calculator';
import { DEFAULT_FURNITURE_LAYOUT } from '../../../../core/interior-style/furniture-layout';
import { getInteriorStyle } from '../../../../core/interior-style/interior-style-catalog';
import type { InteriorStyleId } from '../../../../core/interior-style/interior-style.types';
import { disposeMaterial } from '../three-object-disposal';
import type { SemanticType } from '../viewer-3d.types';

import { buildFurnitureLayout, disposeFurnitureGroup } from './furniture-layout-builder';
import { buildHouseMaterials, createDefaultHouseMaterials, type HouseMaterials } from './material-library';

/**
 * Interior-style engine: independent of the CubiCasa parser, the structural geometry
 * generator, the player controller, Angular, and the budget UI — it only touches
 * plain THREE objects it's handed (a house group to retexture, a collidables group to
 * add/remove furniture from) and the interior-style domain model in core/interior-style/.
 *
 * Style application never rebuilds house geometry — it only swaps each wall/floor
 * mesh's `.material` (found via the stable `userData.semanticType` tag, never
 * children[] order) and swaps the furniture group. Rapid repeated applyStyle() calls
 * are race-safe via a monotonically increasing request token: a call whose result
 * arrives after a newer call has already started discards its own work instead of
 * clobbering the newer one.
 */
export class InteriorStyleManager {
  private currentStyleId: InteriorStyleId = 'none';
  private currentMaterials: HouseMaterials | null = null;
  private furnitureGroup: THREE.Group | null = null;
  private requestToken = 0;

  constructor(private readonly collidables: THREE.Group) {}

  get currentStyle(): InteriorStyleId {
    return this.currentStyleId;
  }

  get hasFurniture(): boolean {
    return this.furnitureGroup !== null;
  }

  getBudget(floorAreaM2?: number): BudgetSummary {
    return computeBudget(this.currentStyleId, floorAreaM2);
  }

  /**
   * Applies `styleId`'s materials to `houseGroup`'s wall/floor meshes and rebuilds the
   * furniture group. Furniture is only populated when `isDefaultFloorplan` is true —
   * placement is manual and only tuned for the bundled demo plan (see
   * furniture-layout.ts); for any other loaded SVG, the furniture group stays empty
   * (see `hasFurniture`, used by the page to show "distribución automática no
   * disponible" for a non-default plan instead of silently showing nothing).
   */
  async applyStyle(
    styleId: InteriorStyleId,
    houseGroup: THREE.Group | null,
    isDefaultFloorplan: boolean,
    rendererMaxAnisotropy: number,
  ): Promise<void> {
    const token = ++this.requestToken;
    const style = getInteriorStyle(styleId);

    const materials = styleId === 'none' ? createDefaultHouseMaterials() : await buildHouseMaterials(style, rendererMaxAnisotropy);

    const furnitureGroup =
      isDefaultFloorplan && styleId !== 'none' ? await buildFurnitureLayout(styleId, DEFAULT_FURNITURE_LAYOUT) : null;

    if (token !== this.requestToken) {
      // A newer applyStyle() call started while this one was still loading — the
      // newer call owns the current state now, so discard what was just built here.
      disposeMaterial(materials.wall, true);
      disposeMaterial(materials.floor, true);
      if (furnitureGroup) {
        disposeFurnitureGroup(furnitureGroup);
      }
      return;
    }

    this.applyHouseMaterials(houseGroup, materials);
    this.swapFurniture(furnitureGroup);
    this.currentStyleId = styleId;
  }

  dispose(): void {
    ++this.requestToken; // invalidate any in-flight applyStyle() so it won't touch state after this
    if (this.currentMaterials) {
      disposeMaterial(this.currentMaterials.wall, true);
      disposeMaterial(this.currentMaterials.floor, true);
      this.currentMaterials = null;
    }
    this.swapFurniture(null);
  }

  private applyHouseMaterials(houseGroup: THREE.Group | null, materials: HouseMaterials): void {
    if (this.currentMaterials) {
      disposeMaterial(this.currentMaterials.wall, true);
      disposeMaterial(this.currentMaterials.floor, true);
    }
    this.currentMaterials = materials;

    if (!houseGroup) {
      return;
    }
    houseGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      const semanticType = (object.userData as { semanticType?: SemanticType }).semanticType;
      if (semanticType === 'wall') {
        object.material = materials.wall;
      } else if (semanticType === 'floor') {
        object.material = materials.floor;
      }
    });
  }

  private swapFurniture(nextGroup: THREE.Group | null): void {
    if (this.furnitureGroup) {
      this.collidables.remove(this.furnitureGroup);
      disposeFurnitureGroup(this.furnitureGroup);
      this.furnitureGroup = null;
    }
    if (nextGroup) {
      this.collidables.add(nextGroup);
      this.furnitureGroup = nextGroup;
    }
  }
}
