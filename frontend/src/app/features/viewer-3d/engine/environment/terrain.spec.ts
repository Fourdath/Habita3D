import type { Floorplan } from '../../../../core/floorplan/floorplan.types';

import { computeEnvironmentBounds } from './terrain';
import { ENVIRONMENT_MARGIN_RATIO, ENVIRONMENT_MIN_MARGIN_M } from './environment.constants';

function floorplanWithOuterPerimeter(points: [number, number][]): Floorplan {
  return {
    scaleMetersPerUnit: 0.01,
    walls: [],
    doors: [],
    windows: [],
    rooms: [],
    outerPerimeter: points,
  };
}

describe('computeEnvironmentBounds', () => {
  it('uses the fixed minimum margin for a small house (10m is bigger than half its longer side)', () => {
    // 4m x 3m footprint: half the longer side is 2m, well under the 10m floor.
    const floorplan = floorplanWithOuterPerimeter([
      [-2, -1.5],
      [2, -1.5],
      [2, 1.5],
      [-2, 1.5],
    ]);

    const bounds = computeEnvironmentBounds(floorplan);

    expect(bounds.houseWidth).toBeCloseTo(4, 5);
    expect(bounds.houseDepth).toBeCloseTo(3, 5);
    expect(bounds.margin).toBe(ENVIRONMENT_MIN_MARGIN_M);
    expect(bounds.terrainWidth).toBeCloseTo(4 + ENVIRONMENT_MIN_MARGIN_M * 2, 5);
    expect(bounds.terrainDepth).toBeCloseTo(3 + ENVIRONMENT_MIN_MARGIN_M * 2, 5);
  });

  it('uses the proportional margin for a large house (over 20m long side)', () => {
    const longSide = 30;
    const floorplan = floorplanWithOuterPerimeter([
      [-longSide / 2, -5],
      [longSide / 2, -5],
      [longSide / 2, 5],
      [-longSide / 2, 5],
    ]);

    const bounds = computeEnvironmentBounds(floorplan);
    const expectedMargin = ENVIRONMENT_MARGIN_RATIO * longSide;

    expect(expectedMargin).toBeGreaterThan(ENVIRONMENT_MIN_MARGIN_M);
    expect(bounds.margin).toBeCloseTo(expectedMargin, 5);
  });

  it('centers the terrain on the house footprint (world X = plan X, world Z = -plan Y)', () => {
    const floorplan = floorplanWithOuterPerimeter([
      [1, 2],
      [5, 2],
      [5, 6],
      [1, 6],
    ]);

    const bounds = computeEnvironmentBounds(floorplan);

    expect(bounds.centerX).toBeCloseTo(3, 5); // (1+5)/2
    expect(bounds.centerZ).toBeCloseTo(-4, 5); // -(2+6)/2
  });
});
