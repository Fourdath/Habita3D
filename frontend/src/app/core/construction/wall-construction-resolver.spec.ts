import type { Floorplan, FloorplanRoom, FloorplanWall } from '../floorplan/floorplan.types';
import { resolveWallConstruction } from './wall-construction-resolver';

const room = (id: string, polygon: [number, number][], type: 'DRY' | 'BATHROOM'): FloorplanRoom => ({ id, name: id, type: type === 'DRY' ? 'Bedroom' : 'Bath', polygon, semantic: { type, confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' } });

describe('wall construction resolution', () => {
  it('resolves different adjacent rooms and keeps thickness inference uncertain', () => {
    const wall: FloorplanWall = { id: 'w', start: [0, 0], end: [4, 0], polygon: [[0, -0.05], [4, -0.05], [4, 0.05], [0, 0.05]], thickness: 0.1, isExterior: false };
    const plan: Floorplan = { scaleMetersPerUnit: 1, walls: [wall], doors: [], windows: [], fixtures: [], outerPerimeter: [[-1, -3], [5, -3], [5, 3], [-1, 3]], rooms: [room('bedroom', [[0, -3], [4, -3], [4, -0.05], [0, -0.05]], 'DRY'), room('bath', [[0, 0.05], [4, 0.05], [4, 3], [0, 3]], 'BATHROOM')] };
    const result = resolveWallConstruction(wall, plan);
    expect(new Set([result.sideA.roomId, result.sideB.roomId])).toEqual(new Set(['bedroom', 'bath']));
    expect(result.assemblyId).toBe('INTERIOR_LIGHT');
    expect(result.confidence).toBeLessThan(1);
  });
});
