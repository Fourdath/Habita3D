export interface RequiredSheetPiece {
  id: string;
  width: number;
  height: number;
}

export interface SheetPlacement extends RequiredSheetPiece {
  sheetIndex: number;
  x: number;
  y: number;
  rotated: boolean;
}

export interface SheetCutOptimization {
  sheetsUsed: number;
  totalStockArea: number;
  requiredArea: number;
  wasteArea: number;
  utilizationPercent: number;
  placements: SheetPlacement[];
  leftovers: Array<{ sheetIndex: number; x: number; y: number; width: number; height: number }>;
}

interface FreeRectangle { sheetIndex: number; x: number; y: number; width: number; height: number }

/** Deterministic guillotine best-area-fit. Every input piece must already fit one stock sheet. */
export function optimizeSheetCuts(stockSheet: { width: number; height: number }, requiredPieces: readonly RequiredSheetPiece[]): SheetCutOptimization {
  if (!(stockSheet.width > 0 && stockSheet.height > 0)) throw new Error('Stock sheet dimensions must be positive');
  const pieces = [...requiredPieces].filter((piece) => piece.width > 1e-8 && piece.height > 1e-8)
    .sort((left, right) => right.width * right.height - left.width * left.height || left.id.localeCompare(right.id));
  const free: FreeRectangle[] = [];
  const placements: SheetPlacement[] = [];
  let sheetsUsed = 0;

  for (const piece of pieces) {
    let candidate = findBestFit(piece, free);
    if (!candidate) {
      if (!fits(piece, stockSheet.width, stockSheet.height) && !fitsRotated(piece, stockSheet.width, stockSheet.height)) {
        throw new Error(`Piece ${piece.id} exceeds stock sheet dimensions`);
      }
      free.push({ sheetIndex: sheetsUsed++, x: 0, y: 0, width: stockSheet.width, height: stockSheet.height });
      candidate = findBestFit(piece, free)!;
    }
    const rectangle = free.splice(candidate.index, 1)[0];
    const width = candidate.rotated ? piece.height : piece.width;
    const height = candidate.rotated ? piece.width : piece.height;
    placements.push({ ...piece, sheetIndex: rectangle.sheetIndex, x: rectangle.x, y: rectangle.y, rotated: candidate.rotated });
    if (rectangle.width - width > 1e-8) free.push({ sheetIndex: rectangle.sheetIndex, x: rectangle.x + width, y: rectangle.y, width: rectangle.width - width, height });
    if (rectangle.height - height > 1e-8) free.push({ sheetIndex: rectangle.sheetIndex, x: rectangle.x, y: rectangle.y + height, width: rectangle.width, height: rectangle.height - height });
    pruneContainedRectangles(free);
  }

  const requiredArea = pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0);
  const totalStockArea = sheetsUsed * stockSheet.width * stockSheet.height;
  const wasteArea = Math.max(0, totalStockArea - requiredArea);
  return { sheetsUsed, totalStockArea, requiredArea, wasteArea, utilizationPercent: totalStockArea > 0 ? (requiredArea / totalStockArea) * 100 : 100, placements, leftovers: free };
}

function findBestFit(piece: RequiredSheetPiece, free: FreeRectangle[]): { index: number; rotated: boolean } | undefined {
  let best: { index: number; rotated: boolean; waste: number } | undefined;
  free.forEach((rectangle, index) => {
    for (const rotated of [false, true]) {
      const width = rotated ? piece.height : piece.width;
      const height = rotated ? piece.width : piece.height;
      if (width <= rectangle.width + 1e-8 && height <= rectangle.height + 1e-8) {
        const waste = rectangle.width * rectangle.height - width * height;
        if (!best || waste < best.waste - 1e-8 || (Math.abs(waste - best.waste) < 1e-8 && index < best.index)) best = { index, rotated, waste };
      }
    }
  });
  return best;
}

function pruneContainedRectangles(rectangles: FreeRectangle[]): void {
  for (let index = rectangles.length - 1; index >= 0; index--) {
    const current = rectangles[index];
    if (rectangles.some((other, otherIndex) => otherIndex !== index && current.sheetIndex === other.sheetIndex
      && current.x >= other.x - 1e-8 && current.y >= other.y - 1e-8
      && current.x + current.width <= other.x + other.width + 1e-8
      && current.y + current.height <= other.y + other.height + 1e-8)) rectangles.splice(index, 1);
  }
}

function fits(piece: RequiredSheetPiece, width: number, height: number): boolean { return piece.width <= width + 1e-8 && piece.height <= height + 1e-8; }
function fitsRotated(piece: RequiredSheetPiece, width: number, height: number): boolean { return piece.height <= width + 1e-8 && piece.width <= height + 1e-8; }
