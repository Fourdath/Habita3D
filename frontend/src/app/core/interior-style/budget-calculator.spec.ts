import { computeBudget, computeFloorAreaM2, formatClp } from './budget-calculator';
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

  it('uses floorAreaM2 * 1.1 for m2-priced items when a reliable area is given', () => {
    const withoutArea = computeBudget('nordic');
    const floorItemWithoutArea = withoutArea.items.find((item) => item.unit === 'm2')!;

    const withArea = computeBudget('nordic', 50);
    const floorItemWithArea = withArea.items.find((item) => item.unit === 'm2')!;

    expect(floorItemWithoutArea.quantity).not.toBe(55);
    expect(floorItemWithArea.quantity).toBeCloseTo(55, 5); // 50 * 1.1
    expect(floorItemWithArea.subtotalClp).toBe(Math.round(55 * floorItemWithArea.unitPriceClp));
  });

  it('falls back to the fixed placeholder quantity when no reliable area is given', () => {
    const noArea = computeBudget('nordic');
    const zeroArea = computeBudget('nordic', 0);
    const negativeArea = computeBudget('nordic', -5);

    const style = getInteriorStyle('nordic');
    const catalogFloorItem = style.budgetItems.find((item) => item.unit === 'm2')!;

    for (const budget of [noArea, zeroArea, negativeArea]) {
      const floorItem = budget.items.find((item) => item.unit === 'm2')!;
      expect(floorItem.quantity).toBe(catalogFloorItem.quantity);
    }
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
