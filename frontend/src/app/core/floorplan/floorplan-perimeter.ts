import type { Point2 } from './floorplan.types';
import { parsePointsAttribute } from './geometry-utils';
import { applyMatrix, cumulativeTransform } from './svg-transform';

const GRID_RESOLUTION = 2;
const GRID_PADDING = 2;

/**
 * Building outline in SVG units: rasterizes every wall/space/railing polygon, dilates by
 * one cell to close hairline gaps between mitered wall corners, traces the outer contour
 * (Moore neighborhood) and simplifies it. Caller multiplies by the plan scale.
 */
export function detectOuterPerimeter(document: Document): Point2[] {
  const polygons: Point2[][] = [];
  document.querySelectorAll('polygon').forEach((element) => {
    if (element.closest('.FixedFurniture') || element.closest('.SelectionControls')) return;
    if (!element.closest('g[class*="Space"], g[class*="Wall"], g.Railing')) return;
    if (element.closest('g[class*="Door"]') || element.closest('g[class*="Window"]')) return;
    const matrix = cumulativeTransform(element);
    const points = parsePointsAttribute(element.getAttribute('points') ?? '').map((point) => applyMatrix(matrix, point));
    if (points.length >= 3) polygons.push(points);
  });
  if (polygons.length === 0) return [];

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

  const width = Math.ceil((maxX - minX) * GRID_RESOLUTION) + GRID_PADDING * 2;
  const height = Math.ceil((maxY - minY) * GRID_RESOLUTION) + GRID_PADDING * 2;
  const grid = new Uint8Array(width * height);
  for (const polygon of polygons) rasterize(polygon, grid, width, height, minX, minY);

  const contour = traceContour(dilate(grid, width, height), width, height);
  if (contour.length < 3) return [];
  const outline = contour.map(([gx, gy]): Point2 => [
    (gx - GRID_PADDING) / GRID_RESOLUTION + minX,
    (gy - GRID_PADDING) / GRID_RESOLUTION + minY,
  ]);
  return douglasPeucker(outline, 1 / GRID_RESOLUTION);
}

function rasterize(polygon: Point2[], grid: Uint8Array, width: number, height: number, originX: number, originY: number): void {
  const cells = polygon.map(([x, y]): Point2 => [
    (x - originX) * GRID_RESOLUTION + GRID_PADDING,
    (y - originY) * GRID_RESOLUTION + GRID_PADDING,
  ]);
  let yMin = height;
  let yMax = 0;
  for (const [, gy] of cells) {
    yMin = Math.min(yMin, Math.floor(gy));
    yMax = Math.max(yMax, Math.floor(gy));
  }
  yMin = Math.max(0, yMin);
  yMax = Math.min(height - 1, yMax);

  for (let y = yMin; y <= yMax; y++) {
    const crossings: number[] = [];
    for (let index = 0; index < cells.length; index++) {
      const [x0, y0] = cells[index];
      const [x1, y1] = cells[(index + 1) % cells.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        crossings.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index < crossings.length - 1; index += 2) {
      const from = Math.max(0, Math.ceil(crossings[index]));
      const to = Math.min(width - 1, Math.floor(crossings[index + 1]));
      for (let x = from; x <= to; x++) grid[y * width + x] = 1;
    }
  }
}

function dilate(grid: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x]) {
        out[y * width + x] = 1;
        continue;
      }
      const neighbour = (x > 0 && grid[y * width + x - 1])
        || (x < width - 1 && grid[y * width + x + 1])
        || (y > 0 && grid[(y - 1) * width + x])
        || (y < height - 1 && grid[(y + 1) * width + x]);
      if (neighbour) out[y * width + x] = 1;
    }
  }
  return out;
}

const MOORE_DX = [1, 1, 0, -1, -1, -1, 0, 1];
const MOORE_DY = [0, 1, 1, 1, 0, -1, -1, -1];

function traceContour(grid: Uint8Array, width: number, height: number): Point2[] {
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
  if (startX < 0) return [];

  const contour: Point2[] = [];
  let x = startX;
  let y = startY;
  let direction = 7;
  for (let iteration = 0; iteration < width * height * 4; iteration++) {
    contour.push([x, y]);
    let found = false;
    const from = (direction + 5) % 8;
    for (let offset = 0; offset < 8; offset++) {
      const candidate = (from + offset) % 8;
      const nextX = x + MOORE_DX[candidate];
      const nextY = y + MOORE_DY[candidate];
      if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height && grid[nextY * width + nextX]) {
        x = nextX;
        y = nextY;
        direction = candidate;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (x === startX && y === startY && contour.length > 2) break;
  }
  return contour;
}

function douglasPeucker(points: Point2[], epsilon: number): Point2[] {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDistance = 0;
  let maxIndex = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const candidate = pointSegmentDistance(points[index], first, last);
    if (candidate > maxDistance) {
      maxDistance = candidate;
      maxIndex = index;
    }
  }
  if (maxDistance > epsilon) {
    return [
      ...douglasPeucker(points.slice(0, maxIndex + 1), epsilon).slice(0, -1),
      ...douglasPeucker(points.slice(maxIndex), epsilon),
    ];
  }
  return [first, last];
}

function pointSegmentDistance(point: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-10) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}
