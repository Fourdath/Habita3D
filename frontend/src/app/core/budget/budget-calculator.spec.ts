import type { Floorplan } from '../floorplan/floorplan.types';
import { CONSTRUCTION_PRODUCT_CATALOG } from './construction-product.catalog';
import { computeConstructionBudget } from './budget-calculator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFloorplan } from '../floorplan/cubicasa-parser';

const plan: Floorplan = {
  scaleMetersPerUnit: 1,
  outerPerimeter: [[0, 0], [4, 0], [4, 3], [0, 3]],
  rooms: [
    { id: 'dry', name: 'Bedroom', type: 'Bedroom', semantic: { type: 'DRY', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' }, polygon: [[0, 0], [2, 0], [2, 3], [0, 3]] },
    { id: 'bath', name: 'Bath', type: 'Bath', semantic: { type: 'BATHROOM', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' }, polygon: [[2, 0], [4, 0], [4, 3], [2, 3]] },
  ],
  walls: [{ id: 'shared', start: [2, 0], end: [2, 3], thickness: 0.1, isExterior: false, polygon: [[1.95, 0], [2.05, 0], [2.05, 3], [1.95, 3]] }],
  doors: [{ id: 'door', wallId: 'shared', position: 0.5, width: 0.8, height: 2.1 }],
  windows: [],
  fixtures: [],
};

describe('construction budget calculator', () => {
  it('uses ST and RH on opposite sides and keeps all prices demonstrative', () => {
    const budget = computeConstructionBudget(plan, 'nordic');
    expect(budget.items.some((line) => line.productId === 'GYPSUM_BOARD_ST_12_5')).toBe(true);
    expect(budget.items.some((line) => line.productId === 'GYPSUM_BOARD_RH_12_5')).toBe(true);
    expect(budget.items.every((line) => line.isDemoPrice && line.priceSource === 'demo')).toBe(true);
    expect(budget.items.every((line) => line.subtotalClp === Math.round(line.purchaseQuantity * line.unitPriceClp))).toBe(true);
  });

  it('takes prices from the replaceable catalog', () => {
    const catalog = structuredClone(CONSTRUCTION_PRODUCT_CATALOG);
    catalog.GYPSUM_BOARD_ST_12_5.unitPriceClp += 1000;
    const before = computeConstructionBudget(plan, 'nordic');
    const after = computeConstructionBudget(plan, 'nordic', { productCatalog: catalog });
    expect(after.totalClp).toBeGreaterThan(before.totalClp);
  });

  it('never includes decorative furniture products', () => {
    const budget = computeConstructionBudget(plan, 'industrial');
    expect(budget.items.some((line) => /sofa|bed|chair/i.test(line.description))).toBe(false);
  });

  it('uses exterior fiber cement on an exterior light assembly', () => {
    const exteriorPlan = structuredClone(plan);
    exteriorPlan.walls[0].isExterior = true;
    const budget = computeConstructionBudget(exteriorPlan, 'nordic');
    expect(budget.items.some((line) => line.productId === 'EXTERIOR_FIBERCEMENT_BOARD')).toBe(true);
  });

  it('derives a constructive budget from the bundled CubiCasa regression plan', () => {
    const svg = readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf8');
    const parsed = parseFloorplan(svg, { scaleMetersPerUnit: 0.01 });
    const budget = computeConstructionBudget(parsed, 'nordic');
    expect(parsed.fixtures.map((fixture) => fixture.type)).toEqual([
      'SHOWER', 'APPLIANCE_SPACE', 'BASE_CABINET', 'BATHROOM_SINK', 'SHOWER_SCREEN',
      'BASE_CABINET', 'REFRIGERATOR', 'BASE_CABINET', 'STOVE', 'KITCHEN_SINK',
    ]);
    expect(parsed.kitchenRuns).toHaveLength(2);
    expect(Object.fromEntries(budget.items.map((line) => [line.id, line.purchaseQuantity]))).toMatchObject({
      GYPSUM_BOARD_ST_12_5: 24,
      GYPSUM_BOARD_RH_12_5: 6,
      EXTERIOR_FIBERCEMENT_BOARD: 4,
      BASEBOARD_WHITE: 20,
      CERAMIC_NORDIC_WALL_bathroom: 83,
      CERAMIC_NORDIC_FLOOR_bathroom: 9,
      CERAMIC_NORDIC_WALL_backsplash: 11,
    });
    expect(budget.items.filter((line) => line.waste).every((line) => line.waste!.waste >= 0)).toBe(true);
    expect(budget.totalClp).toBe(3_081_868);
  });
});
