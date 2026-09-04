import type { FloorplanFixture } from './fixture.types';
import type { FloorplanRoom } from './floorplan.types';
import { pointInPolygon } from './geometry-utils';

export function assignFixturesToRooms(fixtures: FloorplanFixture[], rooms: FloorplanRoom[]): void {
  for (const fixture of fixtures) {
    const room = rooms.find((candidate) => pointInPolygon(fixture.position, candidate.polygon));
    fixture.roomId = room?.id;
  }
}

export function resolveAmbiguousSinks(fixtures: FloorplanFixture[], rooms: FloorplanRoom[]): void {
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  for (const fixture of fixtures) {
    if (fixture.type !== 'UNKNOWN_SINK') continue;
    const roomType = fixture.roomId ? roomsById.get(fixture.roomId)?.semantic.type : undefined;
    const isDouble = fixture.sourceClasses.includes('DoubleSink');
    if (roomType === 'BATHROOM') fixture.type = 'BATHROOM_SINK';
    else if (roomType === 'KITCHEN') fixture.type = isDouble ? 'DOUBLE_KITCHEN_SINK' : 'KITCHEN_SINK';
  }
}
