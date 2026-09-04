import type { Floorplan, FloorplanWall } from '../floorplan/floorplan.types';
import type {
  ConstructionAssumptions,
  WallAssemblyId,
  WallConstruction,
  WallConstructionOverride,
  WallInferenceSource,
} from './wall-assembly.types';
import { resolveWallSides } from './wall-side-resolver';

export const DEFAULT_CONSTRUCTION_ASSUMPTIONS: ConstructionAssumptions = {
  defaultInteriorAssembly: 'INTERIOR_LIGHT',
  defaultExteriorAssembly: 'EXTERIOR_LIGHT',
  lightWallThicknessThresholdM: 0.12,
  heavyWallThicknessThresholdM: 0.2,
};

export function resolveWallConstruction(
  wall: FloorplanWall,
  floorplan: Floorplan,
  assumptions: ConstructionAssumptions = DEFAULT_CONSTRUCTION_ASSUMPTIONS,
  override?: WallConstructionOverride,
): WallConstruction {
  const sides = resolveWallSides(wall, floorplan);
  if (override) {
    return { wallId: wall.id, assemblyId: override.assemblyId, confidence: 1, inferenceSource: 'USER_OVERRIDE', isUserOverride: true, ...sides };
  }

  const inferred = inferAssembly(wall, assumptions);
  return { wallId: wall.id, ...inferred, isUserOverride: false, ...sides };
}

export function resolveAllWallConstructions(
  floorplan: Floorplan,
  assumptions: ConstructionAssumptions = DEFAULT_CONSTRUCTION_ASSUMPTIONS,
  overrides: WallConstructionOverride[] = [],
): WallConstruction[] {
  const byWall = new Map(overrides.map((override) => [override.wallId, override]));
  return floorplan.walls.map((wall) => resolveWallConstruction(wall, floorplan, assumptions, byWall.get(wall.id)));
}

function inferAssembly(
  wall: FloorplanWall,
  assumptions: ConstructionAssumptions,
): { assemblyId: WallAssemblyId; confidence: number; inferenceSource: WallInferenceSource } {
  const exterior = wall.isExterior;
  if (wall.thickness <= assumptions.lightWallThicknessThresholdM) {
    return { assemblyId: exterior ? 'EXTERIOR_LIGHT' : 'INTERIOR_LIGHT', confidence: 0.68, inferenceSource: 'THICKNESS_HEURISTIC' };
  }
  if (wall.thickness >= assumptions.heavyWallThicknessThresholdM) {
    return { assemblyId: exterior ? 'EXTERIOR_CONCRETE' : 'INTERIOR_CONCRETE', confidence: 0.62, inferenceSource: 'THICKNESS_HEURISTIC' };
  }
  return {
    assemblyId: exterior ? assumptions.defaultExteriorAssembly : assumptions.defaultInteriorAssembly,
    confidence: 0.5,
    inferenceSource: 'PROJECT_DEFAULT',
  };
}
