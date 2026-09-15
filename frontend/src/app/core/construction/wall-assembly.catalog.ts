import type { ConstructionAssumptions, WallAssemblyId } from './wall-assembly.types';

export interface WallAssembly {
  id: WallAssemblyId;
  layers: string[];
  /** Concrete assemblies are inferred from thickness only: they need an engineer's spec. */
  requiresStructuralSpecification: boolean;
}

export const WALL_ASSEMBLY_CATALOG: Record<Exclude<WallAssemblyId, 'UNKNOWN'>, WallAssembly> = {
  INTERIOR_LIGHT: {
    id: 'INTERIOR_LIGHT',
    layers: ['GYPSUM_BOARD_SIDE_A', 'METAL_STUD_FRAME', 'GYPSUM_BOARD_SIDE_B'],
    requiresStructuralSpecification: false,
  },
  EXTERIOR_LIGHT: {
    id: 'EXTERIOR_LIGHT',
    layers: ['EXTERIOR_FIBERCEMENT_BOARD', 'METAL_STUD_FRAME', 'INTERIOR_GYPSUM_BOARD'],
    requiresStructuralSpecification: false,
  },
  INTERIOR_CONCRETE: {
    id: 'INTERIOR_CONCRETE',
    layers: ['CONCRETE_CORE', 'INDEPENDENT_FINISH_SIDE_A', 'INDEPENDENT_FINISH_SIDE_B'],
    requiresStructuralSpecification: true,
  },
  EXTERIOR_CONCRETE: {
    id: 'EXTERIOR_CONCRETE',
    layers: ['CONCRETE_CORE', 'INDEPENDENT_EXTERIOR_FINISH', 'INDEPENDENT_INTERIOR_FINISH'],
    requiresStructuralSpecification: true,
  },
};

export const isConcreteAssembly = (assemblyId: WallAssemblyId): boolean =>
  assemblyId === 'INTERIOR_CONCRETE' || assemblyId === 'EXTERIOR_CONCRETE';

export const isLightAssembly = (assemblyId: WallAssemblyId): boolean =>
  assemblyId === 'INTERIOR_LIGHT' || assemblyId === 'EXTERIOR_LIGHT';

/**
 * 0.20 m as the heavy-wall threshold is a project assumption, not a measurement: on the
 * demo plan it marks 6 of 17 walls as concrete. Lower it only together with the budget
 * line, since every concrete wall adds volume at CONCRETE_M3.
 */
export const DEFAULT_ASSUMPTIONS: ConstructionAssumptions = {
  defaultInteriorAssembly: 'INTERIOR_LIGHT',
  defaultExteriorAssembly: 'EXTERIOR_LIGHT',
  lightWallThicknessThresholdM: 0.12,
  heavyWallThicknessThresholdM: 0.2,
};
