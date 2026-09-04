import type { WallAssemblyId } from './wall-assembly.types';

export interface WallAssemblyDefinition {
  id: WallAssemblyId;
  layers: readonly string[];
  requiresStructuralSpecification: boolean;
}

export const WALL_ASSEMBLY_CATALOG: Record<WallAssemblyId, WallAssemblyDefinition> = {
  INTERIOR_LIGHT: {
    id: 'INTERIOR_LIGHT',
    layers: ['GYPSUM_BOARD_SIDE_A', 'METAL_STUD_FRAME', 'INSULATION_FUTURE', 'GYPSUM_BOARD_SIDE_B'],
    requiresStructuralSpecification: false,
  },
  EXTERIOR_LIGHT: {
    id: 'EXTERIOR_LIGHT',
    layers: ['EXTERIOR_FIBERCEMENT_BOARD', 'WEATHER_BARRIER_FUTURE', 'METAL_STUD_FRAME', 'INSULATION_FUTURE', 'INTERIOR_GYPSUM_BOARD'],
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
  UNKNOWN: { id: 'UNKNOWN', layers: [], requiresStructuralSpecification: false },
};
