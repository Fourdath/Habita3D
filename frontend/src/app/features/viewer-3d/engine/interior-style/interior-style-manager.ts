import * as THREE from 'three';

import {
  computeBudget,
  type BudgetSummary,
  type FloorplanMeasurements,
} from '../../../../core/interior-style/budget-calculator';
import { getInteriorStyle } from '../../../../core/interior-style/interior-style-catalog';
import type { InteriorStyleId } from '../../../../core/interior-style/interior-style.types';
import { disposeMaterial } from '../three-object-disposal';
import type { SemanticType } from '../viewer-3d.types';

import { buildHouseMaterials, createDefaultHouseMaterials, type HouseMaterials } from './material-library';

/** Applies a finish palette to semantic house meshes without changing geometry. */
export class InteriorStyleManager {
  private currentStyleId: InteriorStyleId = 'none';
  private currentMaterials: HouseMaterials | null = null;
  private requestToken = 0;

  get currentStyle(): InteriorStyleId {
    return this.currentStyleId;
  }

  getBudget(measurements?: FloorplanMeasurements): BudgetSummary {
    return computeBudget(this.currentStyleId, measurements);
  }

  async applyStyle(
    styleId: InteriorStyleId,
    houseGroup: THREE.Group | null,
    rendererMaxAnisotropy: number,
  ): Promise<void> {
    const token = ++this.requestToken;
    const style = getInteriorStyle(styleId);
    const materials =
      styleId === 'none'
        ? createDefaultHouseMaterials()
        : await buildHouseMaterials(style, rendererMaxAnisotropy);

    if (token !== this.requestToken) {
      disposeHouseMaterials(materials);
      return;
    }

    this.applyHouseMaterials(houseGroup, materials, styleId);
    this.currentStyleId = styleId;
  }

  dispose(): void {
    ++this.requestToken;
    if (this.currentMaterials) {
      disposeHouseMaterials(this.currentMaterials);
      this.currentMaterials = null;
    }
  }

  private applyHouseMaterials(
    houseGroup: THREE.Group | null,
    materials: HouseMaterials,
    styleId: InteriorStyleId,
  ): void {
    if (this.currentMaterials) {
      disposeHouseMaterials(this.currentMaterials);
    }
    this.currentMaterials = materials;

    const lighting = getInteriorStyle(styleId).lighting;
    const lightColor = lighting?.roomLightColor ?? 0xffd6a3;
    const baseIntensity = lighting?.roomLightIntensity ?? 0.65;

    houseGroup?.traverse((object) => {
      const semanticType = (object.userData as { semanticType?: SemanticType }).semanticType;
      if (object instanceof THREE.PointLight && semanticType === 'roomLight') {
        const intensityScale = Number(object.userData['intensityScale'] ?? 1);
        object.color.setHex(lightColor);
        object.intensity = baseIntensity * intensityScale;
        return;
      }
      if (!(object instanceof THREE.Mesh)) return;

      const material = materialForSemanticType(semanticType, materials);
      if (material) object.material = material;
    });
  }
}

function materialForSemanticType(
  semanticType: SemanticType | undefined,
  materials: HouseMaterials,
): THREE.Material | null {
  switch (semanticType) {
    case 'wall':
      return materials.interiorWall;
    case 'exteriorWall':
      return materials.exteriorWall;
    case 'floor':
      return materials.floor;
    case 'ceiling':
      return materials.ceiling;
    case 'baseboard':
    case 'doorFrame':
      return materials.trim;
    case 'windowFrame':
      return materials.windowFrame;
    case 'window':
      return materials.glass;
    case 'lightFixture':
      return materials.fixture;
    default:
      return null;
  }
}

function disposeHouseMaterials(materials: HouseMaterials): void {
  const uniqueMaterials = new Set<THREE.Material>(Object.values(materials));
  for (const material of uniqueMaterials) {
    // Texture objects live in texture-cache.ts and are deliberately retained between
    // style switches. Only the inexpensive material wrappers are style-owned.
    disposeMaterial(material, true);
  }
}
