import {
  computeBudget,
  computeFloorAreaM2,
  computeFloorplanMeasurements,
  formatClp,
  type FloorplanMeasurements,
} from './budget-calculator';
import { getInteriorStyle } from './interior-style-catalog';

describe('computeBudget', () => {
  it('returns an empty, zero-total budget for "none"', () => {
    const budget = computeBudget('none');
    expect(budget.items).toHaveLength(0);
    expect(budget.totalClp).toBe(0);
    expect(budget.isDemoPricing).toBe(true);
  });

  it('computes a subtotal per item and a total equal to their sum, for nordic', () => {
    const budget = computeBudget('nordic');
    const style = getInteriorStyle('nordic');

    expect(budget.items).toHaveLength(style.budgetItems.length);
    for (const item of budget.items) {
      expect(item.subtotalClp).toBe(Math.round(item.quantity * item.unitPriceClp));
    }
    const expectedTotal = budget.items.reduce((sum, item) => sum + item.subtotalClp, 0);
    expect(budget.totalClp).toBe(expectedTotal);
    expect(budget.totalClp).toBeGreaterThan(0);
  });

  it('gives nordic and industrial different totals (distinct demo pricing)', () => {
    expect(computeBudget('nordic').totalClp).not.toBe(computeBudget('industrial').totalClp);
  });

  const measurements: FloorplanMeasurements = {
    floorAreaM2: 50,
    interiorWallAreaM2: 90,
    exteriorWallAreaM2: 70,
    ceilingAreaM2: 50,
    baseboardLengthM: 42,
    doorCount: 4,
    windowCount: 6,
    lightCount: 5,
  };

  it('uses measured quantities and each finish waste factor', () => {
    const withoutArea = computeBudget('nordic');
    const floorItemWithoutArea = withoutArea.items.find((item) => item.quantitySource === 'floorAreaM2')!;

    const withArea = computeBudget('nordic', measurements);
    const floorItemWithArea = withArea.items.find((item) => item.quantitySource === 'floorAreaM2')!;

    expect(floorItemWithoutArea.quantity).not.toBe(55);
    expect(floorItemWithArea.quantity).toBeCloseTo(55, 5);
    expect(floorItemWithArea.subtotalClp).toBe(Math.round(55 * floorItemWithArea.unitPriceClp));
    expect(withArea.items.find((item) => item.quantitySource === 'windowCount')?.quantity).toBe(6);
  });

  it('falls back to catalog placeholder quantities when measurements are absent', () => {
    const noArea = computeBudget('nordic');
    const style = getInteriorStyle('nordic');
    const catalogFloorItem = style.budgetItems.find((item) => item.quantitySource === 'floorAreaM2')!;
    const floorItem = noArea.items.find((item) => item.quantitySource === 'floorAreaM2')!;
    expect(floorItem.quantity).toBeCloseTo(catalogFloorItem.quantity * (catalogFloorItem.wasteFactor ?? 1), 5);
  });
});

describe('computeFloorplanMeasurements', () => {
  it('measures surfaces, openings, trim and fixture counts from the parsed plan', () => {
    const measurements = computeFloorplanMeasurements(
      {
        scaleMetersPerUnit: 1,
        walls: [
          {
            id: 'wall-1',
            start: [0, 0],
            end: [4, 0],
            thickness: 0.15,
            isExterior: true,
            polygon: [[0, 0], [4, 0], [4, 0.15], [0, 0.15]],
          },
        ],
        doors: [{ id: 'door-1', wallId: 'wall-1', position: 0.5, width: 1, height: 2 }],
        windows: [{ id: 'window-1', wallId: 'wall-1', position: 0.8, width: 1, height: 1, sillHeight: 0.9 }],
        rooms: [{ id: 'room-1', name: 'Sala', type: 'LivingRoom', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]], semantic: { type: 'DRY', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' } }],
        fixtures: [],
        outerPerimeter: [[0, 0], [4, 0], [4, 3], [0, 3]],
      },
      2.4,
    );

    expect(measurements.floorAreaM2).toBe(12);
    expect(measurements.interiorWallAreaM2).toBeCloseTo(6.6, 5);
    expect(measurements.exteriorWallAreaM2).toBeCloseTo(6.6, 5);
    expect(measurements.baseboardLengthM).toBe(3);
    expect(measurements.doorCount).toBe(1);
    expect(measurements.windowCount).toBe(1);
    expect(measurements.lightCount).toBe(1);
  });
});

describe('computeFloorAreaM2', () => {
  it('sums the area of every room polygon (shoelace formula)', () => {
    // A 4x3 rectangle (area 12) and a 2x2 square (area 4).
    const area = computeFloorAreaM2([
      [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    ]);

    expect(area).toBeCloseTo(16, 5);
  });

  it('is unaffected by polygon winding direction', () => {
    const clockwise = computeFloorAreaM2([
      [
        [0, 0],
        [0, 3],
        [4, 3],
        [4, 0],
      ],
    ]);
    expect(clockwise).toBeCloseTo(12, 5);
  });
});

describe('formatClp', () => {
  it('formats using Intl.NumberFormat es-CL / CLP', () => {
    const formatted = formatClp(349990);
    expect(formatted).toBe(new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(349990));
  });
});
