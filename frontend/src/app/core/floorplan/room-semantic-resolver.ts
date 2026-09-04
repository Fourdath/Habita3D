import type { FloorplanFixture } from './fixture.types';
import type { FloorplanRoom } from './floorplan.types';
import { classifyCubiCasaRoomType } from './room-type-classification';
import type { RoomSemantic } from './room-semantic.types';

const BATHROOM_ANCHORS = new Set(['TOILET', 'SHOWER', 'BATHTUB']);
const KITCHEN_ANCHORS = new Set(['STOVE', 'REFRIGERATOR']);

export function resolveRoomSemantic(room: FloorplanRoom, fixtures: FloorplanFixture[]): RoomSemantic {
  const direct = classifyCubiCasaRoomType(room.type);
  if (direct.type !== 'UNKNOWN') return direct;

  const types = new Set(fixtures.filter((fixture) => fixture.roomId === room.id).map((fixture) => fixture.type));
  const bathroomAnchorCount = [...types].filter((type) => BATHROOM_ANCHORS.has(type)).length;
  const kitchenAnchorCount = [...types].filter((type) => KITCHEN_ANCHORS.has(type)).length;

  if (bathroomAnchorCount > 0 && kitchenAnchorCount === 0) {
    return { type: 'BATHROOM', confidence: Math.min(0.9, 0.72 + bathroomAnchorCount * 0.08), inferenceSource: 'FIXTURE_ANCHORS' };
  }
  if (kitchenAnchorCount > 0 && bathroomAnchorCount === 0) {
    return { type: 'KITCHEN', confidence: Math.min(0.9, 0.72 + kitchenAnchorCount * 0.08), inferenceSource: 'FIXTURE_ANCHORS' };
  }
  return direct;
}

export function resolveAllRoomSemantics(rooms: FloorplanRoom[], fixtures: FloorplanFixture[]): void {
  for (const room of rooms) room.semantic = resolveRoomSemantic(room, fixtures);
}
