export interface LinearCutPlanPiece {
  stockIndex: number;
  cuts: number[];
  leftoverLength: number;
}

export interface LinearCutOptimization {
  stockPiecesUsed: number;
  requiredLength: number;
  purchasedLength: number;
  wasteLength: number;
  utilizationPercent: number;
  cutPlan: LinearCutPlanPiece[];
}

/** Deterministic Best Fit Decreasing with reusable leftovers. */
export function optimizeLinearCuts(stockLength: number, requiredSegments: readonly number[]): LinearCutOptimization {
  if (!(stockLength > 0)) throw new Error('stockLength must be positive');
  const segments = requiredSegments.filter((length) => length > 1e-8).sort((left, right) => right - left);
  if (segments.some((length) => length > stockLength + 1e-8)) throw new Error('A required segment exceeds stock length');
  const bins: number[][] = [];

  for (const segment of segments) {
    let bestIndex = -1;
    let smallestRemainder = Infinity;
    for (let index = 0; index < bins.length; index++) {
      const remainder = stockLength - bins[index].reduce((sum, value) => sum + value, 0) - segment;
      if (remainder >= -1e-8 && remainder < smallestRemainder - 1e-8) {
        bestIndex = index;
        smallestRemainder = remainder;
      }
    }
    if (bestIndex < 0) bins.push([segment]);
    else bins[bestIndex].push(segment);
  }

  const requiredLength = segments.reduce((sum, value) => sum + value, 0);
  const purchasedLength = bins.length * stockLength;
  const wasteLength = Math.max(0, purchasedLength - requiredLength);
  return {
    stockPiecesUsed: bins.length,
    requiredLength,
    purchasedLength,
    wasteLength,
    utilizationPercent: purchasedLength > 0 ? (requiredLength / purchasedLength) * 100 : 100,
    cutPlan: bins.map((cuts, stockIndex) => ({ stockIndex, cuts, leftoverLength: Math.max(0, stockLength - cuts.reduce((sum, value) => sum + value, 0)) })),
  };
}
