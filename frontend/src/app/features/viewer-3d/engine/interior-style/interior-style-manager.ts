import * as THREE from 'three';

import { computeConstructionBudget } from '../../../../core/budget/budget-calculator';
import type { ConstructionBudgetSummary } from '../../../../core/budget/budget.types';
import type { Floorplan } from '../../../../core/floorplan/floorplan.types';
import { getInteriorStyle } from '../../../../core/interior-style/interior-style-catalog';
import type { InteriorStyleId } from '../../../../core/interior-style/interior-style.types';
import { getStyleMaterialPreset } from '../../../../core/materials/style-material-presets';
import {
  resolveRoomCeilingMaterial,
  resolveRoomFloorMaterial,
  resolveWallSurfaceMaterial,
} from '../../../../core/materials/surface-material-resolver';
import type { MaterialId, WallSurfaceOverride } from '../../../../core/materials/material.types';
import { MaterialRegistry } from '../materials/material-registry';
import type { SemanticType } from '../viewer-3d.types';

interface SemanticMetadata {
  semanticType?: SemanticType;
  wallId?: string;
  wallSide?: 'A' | 'B';
  environment?: 'INTERIOR' | 'EXTERIOR' | 'UNKNOWN';
  roomSemantic?: 'BATHROOM' | 'KITCHEN' | 'DRY' | 'UNKNOWN';
  materialId?: MaterialId;
  materialRole?: 'cabinet' | 'countertop';
}

/** Applies catalog MaterialIds to semantic meshes without rebuilding their geometry. */
export class InteriorStyleManager {
  private currentStyleId: InteriorStyleId = 'none';
  private requestToken = 0;
  private wallOverrides: readonly WallSurfaceOverride[] = [];
  private readonly registry: MaterialRegistry;
  private readonly ownsRegistry: boolean;

  constructor(registry?: MaterialRegistry) {
    this.registry = registry ?? new MaterialRegistry();
    this.ownsRegistry = !registry;
  }

  get currentStyle(): InteriorStyleId {
    return this.currentStyleId;
  }

  setWallSurfaceOverrides(overrides: readonly WallSurfaceOverride[]): void {
    this.wallOverrides = [...overrides];
  }

  getBudget(floorplan?: Floorplan): ConstructionBudgetSummary {
    return floorplan
      ? computeConstructionBudget(floorplan, this.currentStyleId)
      : { styleId: this.currentStyleId, isDemoPricing: true, items: [], totalClp: 0, requiresStructuralSpecification: false };
  }

  async applyStyle(
    styleId: InteriorStyleId,
    houseGroup: THREE.Group | null,
    _rendererMaxAnisotropy?: number,
  ): Promise<void> {
    const token = ++this.requestToken;
    const assignments: Array<{ mesh: THREE.Mesh; materialId: MaterialId }> = [];
    houseGroup?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      assignments.push({ mesh: object, materialId: this.resolveMaterialId(styleId, object.userData as SemanticMetadata) });
    });

    const materialIds = [...new Set(assignments.map((assignment) => assignment.materialId))];
    const loaded = await Promise.all(materialIds.map(async (materialId) => [materialId, await this.registry.get(materialId)] as const));
    if (token !== this.requestToken) return;
    const materials = new Map(loaded);
    for (const assignment of assignments) {
      assignment.mesh.material = materials.get(assignment.materialId)!;
      assignment.mesh.userData['surfaceMaterialId'] = assignment.materialId;
    }

    this.applyLighting(styleId, houseGroup);
    this.currentStyleId = styleId;
  }

  dispose(): void {
    ++this.requestToken;
    if (this.ownsRegistry) this.registry.dispose();
  }

  private resolveMaterialId(styleId: InteriorStyleId, metadata: SemanticMetadata): MaterialId {
    const preset = getStyleMaterialPreset(styleId);
    switch (metadata.semanticType) {
      case 'wall-finish':
      case 'exterior-finish':
        return resolveWallSurfaceMaterial({
          styleId,
          wallId: metadata.wallId ?? '',
          side: metadata.wallSide ?? 'A',
          environment: metadata.environment ?? (metadata.semanticType === 'exterior-finish' ? 'EXTERIOR' : 'UNKNOWN'),
          roomSemantic: metadata.roomSemantic ?? 'UNKNOWN',
          overrides: this.wallOverrides,
        });
      case 'room-floor':
        return resolveRoomFloorMaterial(styleId, metadata.roomSemantic ?? 'UNKNOWN');
      case 'room-ceiling':
      case 'ceiling':
      case 'ceiling-structure':
        return resolveRoomCeilingMaterial(styleId);
      case 'baseboard':
        return preset.baseboard;
      case 'door':
        return preset.door;
      case 'doorFrame':
      case 'windowFrame':
        return preset.frame;
      case 'window':
        return 'WINDOW_GLASS';
      case 'kitchen-backsplash':
        return preset.kitchenBacksplash;
      case 'fixture':
        if (metadata.materialRole === 'cabinet') return preset.kitchenCabinet;
        if (metadata.materialRole === 'countertop' && preset.countertop !== 'MATERIAL_NOT_CONFIGURED') return preset.countertop;
        return metadata.materialId ?? 'FIXTURE_CERAMIC_WHITE';
      case 'lightFixture':
        return 'LIGHT_FIXTURE';
      case 'wall-structure':
        return 'DEFAULT_WALL_NEUTRAL';
      case 'wall':
        return preset.dryWall;
      case 'exteriorWall':
        return preset.exterior;
      case 'floor':
        return preset.dryFloor;
      case 'floor-structure':
        return 'DEFAULT_FLOOR_NEUTRAL';
      default:
        return metadata.materialId ?? 'DEFAULT_WALL_NEUTRAL';
    }
  }

  private applyLighting(styleId: InteriorStyleId, houseGroup: THREE.Group | null): void {
    const lighting = getInteriorStyle(styleId).lighting;
    const lightColor = lighting?.roomLightColor ?? 0xffd6a3;
    const baseIntensity = lighting?.roomLightIntensity ?? 0.65;
    houseGroup?.traverse((object) => {
      if (!(object instanceof THREE.PointLight) || object.userData['semanticType'] !== 'roomLight') return;
      object.color.setHex(lightColor);
      object.intensity = baseIntensity * Number(object.userData['intensityScale'] ?? 1);
    });
  }
}
