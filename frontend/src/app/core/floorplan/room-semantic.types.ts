export type RoomSemanticType = 'BATHROOM' | 'KITCHEN' | 'DRY' | 'UNKNOWN';

export type RoomSemanticInferenceSource =
  | 'CUBICASA_ROOM_TYPE'
  | 'FIXTURE_ANCHORS'
  /** Closed habitable space with no anchor: DRY is the safe assumption (never UNKNOWN). */
  | 'FALLBACK_DRY'
  | 'UNKNOWN';

export interface RoomSemantic {
  type: RoomSemanticType;
  confidence: number;
  inferenceSource: RoomSemanticInferenceSource;
}
