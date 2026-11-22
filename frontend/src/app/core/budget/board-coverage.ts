import type { ManifestWallFace } from './surface-manifest.types';

export type SheetProductId = 'GYPSUM_BOARD_ST_12_5' | 'GYPSUM_BOARD_RH_12_5' | 'EXTERIOR_FIBERCEMENT_BOARD';

/** Classifies the face shared by the quantities and the 3D board view. */
export function sheetProductForFace(face: Pick<ManifestWallFace, 'assemblyId' | 'environment' | 'roomSemantic'>): SheetProductId | null {
  if (face.assemblyId !== 'INTERIOR_LIGHT' && face.assemblyId !== 'EXTERIOR_LIGHT') return null;
  if (face.environment === 'EXTERIOR') {
    return face.assemblyId === 'EXTERIOR_LIGHT' ? 'EXTERIOR_FIBERCEMENT_BOARD' : null;
  }
  if (face.environment !== 'INTERIOR') return null;
  return face.roomSemantic === 'BATHROOM' ? 'GYPSUM_BOARD_RH_12_5' : 'GYPSUM_BOARD_ST_12_5';
}
