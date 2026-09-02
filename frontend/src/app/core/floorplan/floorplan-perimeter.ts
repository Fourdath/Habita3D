import type { Point2 } from './floorplan.types';

/**
 * Detects a floor plan's outer building outline directly from its SVG, in SVG units
 * (the caller scales to meters). Needed for the floor/ceiling slab: the union of Room
 * polygons alone would leave a gap under every doorway, since the wall segment that
 * normally "covers" that span is exactly what a door removes.
 *
 * Adapted from Floorplan2Walkthru's perimeterDetect.ts
 * (https://github.com/Teetertater/Floorplan2Walkthru/blob/main/src/cubicasa/perimeterDetect.ts):
 * rasterize every opaque Space/Wall/Railing polygon onto a binary grid, dilate one
 * cell to close micro-gaps between rooms and walls, trace the outer contour, then
 * simplify it back to a polygon with Douglas-Peucker.
 */

const GRID_RESOLUTION = 2; // grid cells per SVG unit
const GRID_PADDING = 2; // grid cells of padding around the bounding box

export function detectOuterPerimeter(svgText: string): Point2[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');

  const polygons: Point2[][] = [];
  const polygonEls = doc.querySelectorAll('polygon');

  polygonEls.forEach((el) => {
    if (el.closest('.FixedFurniture') || el.closest('.SelectionControls')) {
      return;
    }
    if (!el.closest('g[class*="Space"], g[class*="Wall"], g.Railing')) {
      return;
    }
    // Door thresholds and window glass are openings, not solid footprint.
    if (el.closest('g[class*="Door"]') || el.closest('g[class*="Window"]')) {
      return;
    }

    const points = parsePolygonPoints(el.getAttribute('points') ?? '');
    if (points.length >= 3) {
      polygons.push(points);
    }
  });

  if (polygons.length === 0) {
    return [];
  }

  const bounds = boundingBoxOf(polygons);
  const gridWidth = Math.ceil((bounds.maxX - bounds.minX) * GRID_RESOLUTION) + GRID_PADDING * 2;
  const gridHeight = Math.ceil((bounds.maxY - bounds.minY) * GRID_RESOLUTION) + GRID_PADDING * 2;

  const grid = new Uint8Array(gridWidth * gridHeight);
  for (const polygon of polygons) {
    rasterizePolygon(polygon, grid, gridWidth, gridHeight, bounds.minX, bounds.minY);
  }

  const dilated = dilate(grid, gridWidth, gridHeight);
  const contour = traceOuterContour(dilated, gridWidth, gridHeight);
  if (contour.length < 3) {
    return [];
  }

  const svgContour: Point2[] = contour.map(([gx, gy]) => [
    (gx - GRID_PADDING) / GRID_RESOLUTION + bounds.minX,
    (gy - GRID_PADDING) / GRID_RESOLUTION + bounds.minY,
  ]);

  return douglasPeucker(svgContour, 1 / GRID_RESOLUTION);
}

function parsePolygonPoints(pointsAttr: string): Point2[] {
  return pointsAttr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return [x, y] as Point2;
    })
    .filter(([x, y]) => !isNaN(x) && !isNaN(y));
}

function boundingBoxOf(polygons: Point2[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { minX, minY, maxX, maxY };
}

/** Scanline polygon fill onto the binary grid. */
function rasterizePolygon(
  polygon: Point2[],
  grid: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  originX: number,
  originY: number,
): void {
  const gridPoints = polygon.map(
    ([x, y]): Point2 => [
      (x - originX) * GRID_RESOLUTION + GRID_PADDING,
      (y - originY) * GRID_RESOLUTION + GRID_PADDING,
    ],
  );

  let yMin = gridHeight;
  let yMax = 0;
  for (const [, gy] of gridPoints) {
    yMin = Math.min(yMin, Math.floor(gy));
    yMax = Math.max(yMax, Math.floor(gy));
  }
  yMin = Math.max(0, yMin);
  yMax = Math.min(gridHeight - 1, yMax);

  const n = gridPoints.length;
  for (let y = yMin; y <= yMax; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = gridPoints[i];
      const [x1, y1] = gridPoints[(i + 1) % n];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        const t = (y - y0) / (y1 - y0);
        intersections.push(x0 + t * (x1 - x0));
      }
    }
    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length - 1; i += 2) {
      const xStart = Math.max(0, Math.ceil(intersections[i]));
      const xEnd = Math.min(gridWidth - 1, Math.floor(intersections[i + 1]));
      for (let x = xStart; x <= xEnd; x++) {
        grid[y * gridWidth + x] = 1;
      }
    }
  }
}

/** One-cell 4-neighbour dilation, closing thin gaps left between adjacent polygons. */
function dilate(grid: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x]) {
        out[y * width + x] = 1;
        continue;
      }
      const hasFilledNeighbour =
        (x > 0 && grid[y * width + x - 1]) ||
        (x < width - 1 && grid[y * width + x + 1]) ||
        (y > 0 && grid[(y - 1) * width + x]) ||
        (y < height - 1 && grid[(y + 1) * width + x]);
      if (hasFilledNeighbour) {
        out[y * width + x] = 1;
      }
    }
  }

  return out;
}

// Moore-neighbourhood boundary tracing. Directions: 0=E,1=SE,2=S,3=SW,4=W,5=NW,6=N,7=NE.
const MOORE_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const MOORE_DY = [0, 1, 1, 1, 0, -1, -1, -1];

function traceOuterContour(grid: Uint8Array, width: number, height: number): Point2[] {
  let startX = -1;
  let startY = -1;

  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x]) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) {
    return [];
  }

  const contour: Point2[] = [];
  let cx = startX;
  let cy = startY;
  let dir = 7; // start scanning up-right (we approached from the left)

  const maxIterations = width * height * 4;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    contour.push([cx, cy]);

    let found = false;
    const searchStart = (dir + 5) % 8; // back up ~135 degrees before scanning forward
    for (let i = 0; i < 8; i++) {
      const d = (searchStart + i) % 8;
      const nx = cx + MOORE_DX[d];
      const ny = cy + MOORE_DY[d];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny * width + nx]) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }

    if (!found) {
      break;
    }
    if (cx === startX && cy === startY && contour.length > 2) {
      break;
    }
  }

  return contour;
}

function douglasPeucker(points: Point2[], epsilon: number): Point2[] {
  if (points.length <= 2) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function pointToSegmentDistance(point: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-10) {
    return Math.hypot(point[0] - a[0], point[1] - a[1]);
  }

  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}
