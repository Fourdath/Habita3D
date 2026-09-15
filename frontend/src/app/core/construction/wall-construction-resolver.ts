import type { Floorplan, FloorplanWall } from '../floorplan/floorplan.types';
import { DEFAULT_ASSUMPTIONS } from './wall-assembly.catalog';
import type {
  ConstructionAssumptions, WallConstruction, WallConstructionOverride, WallInferenceSource,
} from './wall-assembly.types';
import { resolveWallSides } from './wall-side-resolver';

export function resolveAllWallConstructions(
  floorplan: Floorplan,
  assumptions: ConstructionAssumptions = DEFAULT_ASSUMPTIONS,
  overrides: readonly WallConstructionOverride[] = [],
): WallConstruction[] {
  const overridesByWall = new Map(overrides.map((override) => [override.wallId, override]));
  return floorplan.walls.map((wall) => {
    const sides = resolveWallSides(wall, floorplan);
    const override = overridesByWall.get(wall.id);
    if (override) {
      return {
        wallId: wall.id,
        assemblyId: override.assemblyId,
        confidence: 1,
        inferenceSource: 'USER_OVERRIDE' as WallInferenceSource,
        isUserOverride: true,
        ...sides,
      };
    }
    return { wallId: wall.id, ...inferAssembly(wall, assumptions), isUserOverride: false, ...sides };
  });
}

function inferAssembly(
  wall: FloorplanWall, assumptions: ConstructionAssumptions,
): { assemblyId: WallConstruction['assemblyId']; confidence: number; inferenceSource: WallInferenceSource } {
  const exterior = wall.isExterior;
  if (wall.thickness <= assumptions.lightWallThicknessThresholdM) {
    return {
      assemblyId: exterior ? 'EXTERIOR_LIGHT' : 'INTERIOR_LIGHT',
      confidence: 0.68,
      inferenceSource: 'THICKNESS_HEURISTIC',
    };
  }
  if (wall.thickness >= assumptions.heavyWallThicknessThresholdM) {
    return {
      assemblyId: exterior ? 'EXTERIOR_CONCRETE' : 'INTERIOR_CONCRETE',
      confidence: 0.62,
      inferenceSource: 'THICKNESS_HEURISTIC',
    };
  }
  return {
    assemblyId: exterior ? assumptions.defaultExteriorAssembly : assumptions.defaultInteriorAssembly,
    confidence: 0.5,
    inferenceSource: 'PROJECT_DEFAULT',
  };
}
