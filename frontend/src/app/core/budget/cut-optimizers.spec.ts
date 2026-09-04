import { optimizeLinearCuts } from './linear-cut-optimizer';
import { optimizeSheetCuts } from './sheet-cut-optimizer';

describe('cut optimizers', () => {
  it('reuses linear leftovers deterministically', () => {
    const first = optimizeLinearCuts(2.4, [1.4, 1, 1, 0.8]);
    expect(first.stockPiecesUsed).toBe(2);
    expect(first.purchasedLength).toBeGreaterThanOrEqual(first.requiredLength);
    expect(first.wasteLength).toBeGreaterThanOrEqual(0);
    expect(optimizeLinearCuts(2.4, [1.4, 1, 1, 0.8])).toEqual(first);
  });

  it('places every sheet piece without overlap and no worse than naive', () => {
    const pieces = [{ id: 'a', width: 1.2, height: 1.2 }, { id: 'b', width: 1.2, height: 1.2 }, { id: 'c', width: 1.2, height: 1.2 }];
    const result = optimizeSheetCuts({ width: 1.2, height: 2.4 }, pieces);
    expect(result.placements).toHaveLength(pieces.length);
    expect(result.sheetsUsed).toBeLessThanOrEqual(pieces.length);
    expect(result.wasteArea).toBeGreaterThanOrEqual(0);
    for (const placement of result.placements) {
      const width = placement.rotated ? placement.height : placement.width;
      const height = placement.rotated ? placement.width : placement.height;
      expect(placement.x + width).toBeLessThanOrEqual(1.2 + 1e-8);
      expect(placement.y + height).toBeLessThanOrEqual(2.4 + 1e-8);
    }
    for (let index = 0; index < result.placements.length; index++) {
      for (let otherIndex = index + 1; otherIndex < result.placements.length; otherIndex++) {
        const left = result.placements[index];
        const right = result.placements[otherIndex];
        if (left.sheetIndex !== right.sheetIndex) continue;
        const leftWidth = left.rotated ? left.height : left.width;
        const leftHeight = left.rotated ? left.width : left.height;
        const rightWidth = right.rotated ? right.height : right.width;
        const rightHeight = right.rotated ? right.width : right.height;
        const separated = left.x + leftWidth <= right.x + 1e-8 || right.x + rightWidth <= left.x + 1e-8
          || left.y + leftHeight <= right.y + 1e-8 || right.y + rightHeight <= left.y + 1e-8;
        expect(separated).toBe(true);
      }
    }
  });
});
