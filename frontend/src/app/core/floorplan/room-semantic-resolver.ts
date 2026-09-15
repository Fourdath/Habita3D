import type { FloorplanFixture, FixtureType } from './fixture.types';
import type { FloorplanRoom } from './floorplan.types';

const BATHROOM_ANCHORS = new Set<FixtureType>(['TOILET', 'SHOWER', 'BATHTUB', 'SHOWER_SCREEN']);
const KITCHEN_ANCHORS = new Set<FixtureType>(['STOVE', 'REFRIGERATOR']);
/** Secondary kitchen evidence: cabinetry alone only decides with two distinct types. */
const KITCHEN_SOFT_ANCHORS = new Set<FixtureType>(['BASE_CABINET', 'WALL_CABINET']);

/**
 * Refines rooms the CubiCasa room type left UNKNOWN, in place.
 *
 * A room that stays UNKNOWN has no floor or wall finish in any style preset, which is
 * how MATERIAL_NOT_CONFIGURED (magenta) reached the scene. There is no such thing as an
 * unfinished enclosed room in a house, so DRY is the fallback.
 */
export function resolveAllRoomSemantics(rooms: FloorplanRoom[], fixtures: FloorplanFixture[]): void {
  for (const room of rooms) {
    if (room.semantic.type !== 'UNKNOWN') continue;
    const types = new Set(fixtures.filter((fixture) => fixture.roomId === room.id).map((fixture) => fixture.type));
    const bathroom = [...types].filter((type) => BATHROOM_ANCHORS.has(type)).length;
    const kitchen = [...types].filter((type) => KITCHEN_ANCHORS.has(type)).length;
    const soft = [...types].filter((type) => KITCHEN_SOFT_ANCHORS.has(type)).length;

    if (bathroom > 0 && kitchen === 0) {
      room.semantic = {
        type: 'BATHROOM',
        confidence: Math.min(0.9, 0.72 + bathroom * 0.08),
        inferenceSource: 'FIXTURE_ANCHORS',
      };
    } else if (kitchen > 0 && bathroom === 0) {
      room.semantic = {
        type: 'KITCHEN',
        confidence: Math.min(0.9, 0.72 + kitchen * 0.08),
        inferenceSource: 'FIXTURE_ANCHORS',
      };
    } else if (soft >= 2 && bathroom === 0) {
      room.semantic = { type: 'KITCHEN', confidence: 0.6, inferenceSource: 'FIXTURE_ANCHORS' };
    } else {
      room.semantic = { type: 'DRY', confidence: 0.4, inferenceSource: 'FALLBACK_DRY' };
    }
  }
}
