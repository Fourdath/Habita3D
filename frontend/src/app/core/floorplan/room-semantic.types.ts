export type RoomSemanticType = 'BATHROOM' | 'KITCHEN' | 'DRY' | 'UNKNOWN';

export type RoomSemanticInferenceSource = 'CUBICASA_ROOM_TYPE' | 'FIXTURE_ANCHORS' | 'UNKNOWN';

export interface RoomSemantic {
  type: RoomSemanticType;
  confidence: number;
  inferenceSource: RoomSemanticInferenceSource;
}
