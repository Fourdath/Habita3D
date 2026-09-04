import type { Floorplan } from './floorplan.types';
import { resolveKitchenRuns } from './kitchen-run-resolver';

const plan: Floorplan = {
  scaleMetersPerUnit: 1,
  walls: [{ id: 'wall', start: [0, 0], end: [4, 0], thickness: 0.1, isExterior: true, polygon: [[0, -0.05], [4, -0.05], [4, 0.05], [0, 0.05]] }],
  rooms: [{ id: 'kitchen', name: 'Kitchen', type: 'Kitchen', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]], semantic: { type: 'KITCHEN', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' } }],
  doors: [],
  windows: [],
  outerPerimeter: [[0, 0], [4, 0], [4, 3], [0, 3]],
  fixtures: [
    { id: 'cabinet', type: 'BASE_CABINET', sourceClasses: ['BaseCabinet'], footprint: [[0.4, 0.05], [1.2, 0.05], [1.2, 0.65], [0.4, 0.65]], position: [0.8, 0.35], rotation: -Math.PI / 2, forwardDirection: [0, -1], width: 0.8, depth: 0.6, roomId: 'kitchen' },
    { id: 'sink', type: 'KITCHEN_SINK', sourceClasses: ['Sink'], footprint: [[1.25, 0.05], [1.85, 0.05], [1.85, 0.65], [1.25, 0.65]], position: [1.55, 0.35], rotation: -Math.PI / 2, forwardDirection: [0, -1], width: 0.6, depth: 0.6, roomId: 'kitchen' },
  ],
};

describe('kitchen run resolver', () => {
  it('groups compatible nearby modules on the same room wall', () => {
    const runs = resolveKitchenRuns(plan);
    expect(runs).toHaveLength(1);
    expect(runs[0].fixtureIds).toEqual(['cabinet', 'sink']);
    expect(runs[0].wallId).toBe('wall');
    expect(Math.hypot(runs[0].end[0] - runs[0].start[0], runs[0].end[1] - runs[0].start[1])).toBeCloseTo(1.45);
  });

  it('does not create runs in non-kitchen rooms', () => {
    const dryPlan = structuredClone(plan);
    dryPlan.rooms[0].semantic.type = 'DRY';
    expect(resolveKitchenRuns(dryPlan)).toEqual([]);
  });
});
