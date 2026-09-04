import type { FloorplanFixture } from './fixture.types';
import type { FloorplanRoom } from './floorplan.types';
import { resolveRoomSemantic } from './room-semantic-resolver';

const room = (type: string): FloorplanRoom => ({
  id: 'room',
  name: type,
  type,
  polygon: [[0, 0], [2, 0], [2, 2], [0, 2]],
  semantic: { type: 'UNKNOWN', confidence: 0, inferenceSource: 'UNKNOWN' },
});
const fixture = (id: string, type: FloorplanFixture['type']): FloorplanFixture => ({
  id,
  type,
  sourceClasses: [],
  footprint: [[0, 0], [1, 0], [1, 1], [0, 1]],
  position: [0.5, 0.5],
  rotation: 0,
  width: 1,
  depth: 1,
  roomId: 'room',
});

describe('room semantic resolver', () => {
  it('classifies direct CubiCasa room types', () => {
    expect(resolveRoomSemantic(room('Bath'), []).type).toBe('BATHROOM');
    expect(resolveRoomSemantic(room('Bath Shower'), []).type).toBe('BATHROOM');
    expect(resolveRoomSemantic(room('Kitchen'), []).type).toBe('KITCHEN');
  });

  it('uses strong anchors deterministically for undefined rooms', () => {
    expect(resolveRoomSemantic(room('Undefined'), [fixture('toilet', 'TOILET'), fixture('shower', 'SHOWER')]).type).toBe('BATHROOM');
    expect(resolveRoomSemantic(room('Undefined'), [fixture('stove', 'STOVE'), fixture('cabinet', 'BASE_CABINET')]).type).toBe('KITCHEN');
    expect(resolveRoomSemantic(room('Undefined'), [fixture('cabinet', 'BASE_CABINET'), fixture('sink', 'UNKNOWN_SINK')]).type).toBe('UNKNOWN');
  });
});
