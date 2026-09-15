import type { RoomSemantic } from './room-semantic.types';

const DRY_ROOM_TYPES = new Set([
  'bedroom', 'livingroom', 'living room', 'dining', 'diningroom', 'hall',
  'corridor', 'entry lobby', 'draughtlobby', 'storage', 'office',
]);

const LIVING_ROOM_TYPES = new Set(['livingroom', 'living room', 'dining', 'diningroom']);

/** CubiCasa room types that are not part of the enclosed building. */
export const EXCLUDED_ROOM_TYPES = new Set(['Outdoor', 'Outdoor Balcony']);

export function classifyRoomType(roomType: string): RoomSemantic {
  const name = roomType.trim().toLowerCase();
  if (name === 'bath' || name === 'bath shower' || name.startsWith('bath ')) {
    return { type: 'BATHROOM', confidence: 0.98, inferenceSource: 'CUBICASA_ROOM_TYPE' };
  }
  if (name === 'kitchen' || name.startsWith('kitchen ')) {
    return { type: 'KITCHEN', confidence: 0.98, inferenceSource: 'CUBICASA_ROOM_TYPE' };
  }
  if (DRY_ROOM_TYPES.has(name)) {
    return { type: 'DRY', confidence: 0.95, inferenceSource: 'CUBICASA_ROOM_TYPE' };
  }
  return { type: 'UNKNOWN', confidence: 0, inferenceSource: 'UNKNOWN' };
}

export const isLivingRoomType = (roomType: string): boolean =>
  LIVING_ROOM_TYPES.has(roomType.trim().toLowerCase());
