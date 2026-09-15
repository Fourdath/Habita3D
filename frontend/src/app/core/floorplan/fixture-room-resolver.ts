import type { FloorplanFixture } from './fixture.types';
import type { FloorplanRoom } from './floorplan.types';
import { pointInPolygon } from './geometry-utils';

export function assignFixturesToRooms(fixtures: FloorplanFixture[], rooms: FloorplanRoom[]): void {
  for (const fixture of fixtures) {
    const room = rooms.find((candidate) => pointInPolygon(fixture.position, candidate.polygon));
    fixture.roomId = room?.id;
  }
}

/**
 * CubiCasa marks Sink/RoundSink/DoubleSink without saying which room they serve, so the
 * parser emits UNKNOWN_SINK and this resolves it once room semantics are known.
 *
 * No sink is ever left UNKNOWN_SINK: the geometry builder has no primitive for that type
 * and used to skip it, so a plan whose kitchen/bath came from fixture anchors rendered
 * with no washbasin at all. When the room gives no answer, size decides.
 */
export function resolveAmbiguousSinks(fixtures: FloorplanFixture[], rooms: FloorplanRoom[]): void {
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  for (const fixture of fixtures) {
    if (fixture.type !== 'UNKNOWN_SINK') continue;
    const roomSemantic = fixture.roomId ? roomsById.get(fixture.roomId)?.semantic.type : undefined;
    const isDouble = fixture.sourceClasses.includes('DoubleSink');
    if (roomSemantic === 'BATHROOM') {
      fixture.type = 'BATHROOM_SINK';
    } else if (roomSemantic === 'KITCHEN') {
      fixture.type = isDouble ? 'DOUBLE_KITCHEN_SINK' : 'KITCHEN_SINK';
    } else {
      fixture.type = isDouble ? 'DOUBLE_KITCHEN_SINK' : Math.max(fixture.width, fixture.depth) > 0.62 ? 'KITCHEN_SINK' : 'BATHROOM_SINK';
    }
  }
}
