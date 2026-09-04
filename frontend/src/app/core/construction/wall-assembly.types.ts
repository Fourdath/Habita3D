export type WallAssemblyId =
  | 'EXTERIOR_CONCRETE'
  | 'EXTERIOR_LIGHT'
  | 'INTERIOR_CONCRETE'
  | 'INTERIOR_LIGHT'
  | 'UNKNOWN';

export type WallInferenceSource =
  | 'CUBICASA_EXTERIOR'
  | 'THICKNESS_HEURISTIC'
  | 'PROJECT_DEFAULT'
  | 'USER_OVERRIDE'
  | 'UNKNOWN';

export type WallSideName = 'A' | 'B';
export type WallSideEnvironment = 'INTERIOR' | 'EXTERIOR' | 'UNKNOWN';

export interface WallSide {
  side: WallSideName;
  roomId?: string;
  environment: WallSideEnvironment;
  confidence: number;
}

export interface WallConstruction {
  wallId: string;
  assemblyId: WallAssemblyId;
  confidence: number;
  inferenceSource: WallInferenceSource;
  isUserOverride: boolean;
  sideA: WallSide;
  sideB: WallSide;
}

export interface ConstructionAssumptions {
  defaultInteriorAssembly: WallAssemblyId;
  defaultExteriorAssembly: WallAssemblyId;
  lightWallThicknessThresholdM: number;
  heavyWallThicknessThresholdM: number;
}

export interface WallConstructionOverride {
  wallId: string;
  assemblyId: WallAssemblyId;
}
