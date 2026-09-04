import type { RoomSemantic } from './room-semantic.types';

const DRY_TYPES = new Set([
  'bedroom',
  'livingroom',
  'living room',
  'dining',
  'diningroom',
  'hall',
  'corridor',
  'entry lobby',
  'draughtlobby',
  'storage',
  'office',
]);

export function classifyCubiCasaRoomType(roomType: string): RoomSemantic {
  const normalized = roomType.trim().toLowerCase();
  if (normalized === 'bath' || normalized === 'bath shower' || normalized.startsWith('bath ')) {
    return { type: 'BATHROOM', confidence: 0.98, inferenceSource: 'CUBICASA_ROOM_TYPE' };
  }
  if (normalized === 'kitchen' || normalized.startsWith('kitchen ')) {
    return { type: 'KITCHEN', confidence: 0.98, inferenceSource: 'CUBICASA_ROOM_TYPE' };
  }
  if (DRY_TYPES.has(normalized)) {
    return { type: 'DRY', confidence: 0.95, inferenceSource: 'CUBICASA_ROOM_TYPE' };
  }
  return { type: 'UNKNOWN', confidence: 0, inferenceSource: 'UNKNOWN' };
}
