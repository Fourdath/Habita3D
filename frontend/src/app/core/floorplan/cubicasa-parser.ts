import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_EXTERIOR_WALL_THICKNESS_M,
  DEFAULT_INTERIOR_WALL_THICKNESS_M,
  DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  MIN_DOOR_WIDTH,
  MIN_WINDOW_WIDTH,
  WALL_THICKNESS_SANITY_MAX_M,
  WALL_THICKNESS_SANITY_MIN_M,
} from './floorplan.constants';
import { detectOuterPerimeter } from './floorplan-perimeter';
import type {
  Floorplan,
  FloorplanDoor,
  FloorplanRoom,
  FloorplanWall,
  FloorplanWindow,
  Point2,
} from './floorplan.types';

export interface CubiCasaSummary {
  rooms: number;
  walls: number;
  doors: number;
  windows: number;
}

export interface CubiCasaWall {
  id: number;
  points: [number, number][];
  pointsMeters: [number, number][];
}

export function inspectCubiCasaSvg(svgText: string): CubiCasaSummary {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const rooms = doc.querySelectorAll('g[class*="Space"]');
  const walls = doc.querySelectorAll('g[class*="Wall"]');
  const doors = doc.querySelectorAll('g[class*="Door"]');
  const windows = doc.querySelectorAll('g[class*="Window"]');

  return {
    rooms: rooms.length,
    walls: walls.length,
    doors: doors.length,
    windows: windows.length,
  };
}

export function extractCubiCasaWalls(svgText: string): CubiCasaWall[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const wallElements = doc.querySelectorAll('g[class*="Wall"]');

  const walls: CubiCasaWall[] = [];

  const scaleMetersPerUnit = 0.01;

  wallElements.forEach((wallElement, index) => {
    const className = wallElement.getAttribute('class') || '';

    // Solo elementos cuya clase contiene exactamente "Wall"
    if (!className.split(/\s+/).includes('Wall')) {
      return;
    }

    // Buscamos el polígono directo del muro
    const polygon = wallElement.querySelector(':scope > polygon');

    if (!polygon) {
      return;
    }

    const pointsText = polygon.getAttribute('points');

    if (!pointsText) {
      return;
    }

    // Coordenadas originales del SVG
    const points = pointsText
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number);

        return [x, y] as [number, number];
      });

    // Conversión de unidades SVG a metros
    const pointsMeters = points.map(([x, y]) => {
      return [
        x * scaleMetersPerUnit,
        y * scaleMetersPerUnit,
      ] as [number, number];
    });

    walls.push({
      id: index,
      points,
      pointsMeters,
    });
  });

  return walls;
}

// ─────────────────────────────────────────────────────────────────────────
// Full floor plan parsing: SVG → Floorplan (walls with openings, rooms,
// outer perimeter). Adapted from Floorplan2Walkthru's parser.ts
// (https://github.com/Teetertater/Floorplan2Walkthru/blob/main/src/cubicasa/parser.ts).
// ─────────────────────────────────────────────────────────────────────────

export interface ParseFloorplanOptions {
  scaleMetersPerUnit: number;
}

const ROOM_TYPE_EXCLUDE = new Set(['Outdoor', 'Outdoor Balcony']);

export function parseFloorplan(svgText: string, options: ParseFloorplanOptions): Floorplan {
  const scale = options.scaleMetersPerUnit;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');

  const rooms = parseRooms(doc, scale);

  const walls: FloorplanWall[] = [];
  const doors: FloorplanDoor[] = [];
  const windows: FloorplanWindow[] = [];
  let wallIndex = 0;

  doc.querySelectorAll('g[class*="Wall"]').forEach((wallElement) => {
    const classNames = (wallElement.getAttribute('class') ?? '').split(/\s+/);
    if (!classNames.includes('Wall')) {
      return;
    }

    // Doors/windows are nested inside a wall's <g>, not other walls — this guard is
    // just a defensive mirror of the reference parser in case a future export nests them.
    const parentWall = wallElement.parentElement?.closest('g[class*="Wall"]');
    if (parentWall && parentWall !== wallElement) {
      return;
    }

    const parsed = parseWallElement(wallElement, scale, `wall_${wallIndex}`);
    if (!parsed) {
      return;
    }

    walls.push(parsed.wall);
    doors.push(...parsed.doors);
    windows.push(...parsed.windows);
    wallIndex++;
  });

  // Railings (e.g. balcony guards) act as barriers too, so they're treated as walls.
  doc.querySelectorAll('g.Railing').forEach((railingElement) => {
    const wall = parseRailingElement(railingElement, scale, `wall_${wallIndex}`);
    if (!wall) {
      return;
    }
    walls.push(wall);
    wallIndex++;
  });

  const outerPerimeter: Point2[] = detectOuterPerimeter(svgText).map(
    ([x, y]): Point2 => [x * scale, y * scale],
  );

  // The player always spawns at world origin (PlayerController), so recenter the whole
  // plan on the outer perimeter's bounding-box center rather than leaving it at its raw,
  // arbitrarily-offset SVG coordinates.
  recenterFloorplan(walls, rooms, outerPerimeter);

  return {
    scaleMetersPerUnit: scale,
    walls,
    doors,
    windows,
    rooms,
    outerPerimeter,
  };
}

function parseRooms(doc: Document, scale: number): FloorplanRoom[] {
  const rooms: FloorplanRoom[] = [];
  let roomIndex = 0;

  doc.querySelectorAll('g[class*="Space"]').forEach((spaceElement) => {
    if (spaceElement.closest('.FixedFurniture') || spaceElement.closest('.SelectionControls')) {
      return;
    }

    const tokens = (spaceElement.getAttribute('class') ?? '').split(/\s+/);
    const spaceTokenIndex = tokens.indexOf('Space');
    const type = tokens.slice(spaceTokenIndex + 1).join(' ');
    if (ROOM_TYPE_EXCLUDE.has(type)) {
      return;
    }

    const polygonEl = spaceElement.querySelector(':scope > polygon');
    if (!polygonEl) {
      return;
    }

    const points = dedupClosingPoint(parsePoints(polygonEl.getAttribute('points') ?? ''));
    if (points.length < 3) {
      return;
    }

    rooms.push({
      id: `room_${roomIndex}`,
      name: type || 'Room',
      type,
      polygon: points.map(([x, y]): Point2 => [x * scale, y * scale]),
    });
    roomIndex++;
  });

  return rooms;
}

function parseWallElement(
  wallElement: Element,
  scale: number,
  wallId: string,
): { wall: FloorplanWall; doors: FloorplanDoor[]; windows: FloorplanWindow[] } | null {
  const isExterior = (wallElement.getAttribute('class') ?? '').includes('External');

  const wallPolygonEl = wallElement.querySelector(':scope > polygon');
  if (!wallPolygonEl) {
    return null;
  }

  const rawPoints = dedupClosingPoint(parsePoints(wallPolygonEl.getAttribute('points') ?? ''));
  if (rawPoints.length < 3) {
    return null;
  }

  const centerline = wallCenterline(rawPoints);
  const start: Point2 = [centerline.start[0] * scale, centerline.start[1] * scale];
  const end: Point2 = [centerline.end[0] * scale, centerline.end[1] * scale];
  const wallLength = segmentLength(start, end);

  const wall: FloorplanWall = {
    id: wallId,
    polygon: rawPoints.map(([x, y]): Point2 => [x * scale, y * scale]),
    start,
    end,
    thickness: resolveWallThickness(centerline.thickness * scale, isExterior ? 'exterior' : 'interior'),
    isExterior,
  };

  const doors: FloorplanDoor[] = [];
  wallElement.querySelectorAll(':scope > g[class*="Door"]').forEach((doorElement, doorIndex) => {
    const opening = parseOpeningPolygon(doorElement, scale, start, end, wallLength);
    if (!opening) {
      return;
    }
    doors.push({
      id: `${wallId}_door_${doorIndex}`,
      wallId,
      position: opening.position,
      width: Math.max(opening.width, MIN_DOOR_WIDTH),
      height: DEFAULT_DOOR_HEIGHT,
    });
  });

  const windows: FloorplanWindow[] = [];
  wallElement.querySelectorAll(':scope > g[class*="Window"]').forEach((windowElement, windowIndex) => {
    const opening = parseOpeningPolygon(windowElement, scale, start, end, wallLength);
    if (!opening) {
      return;
    }
    windows.push({
      id: `${wallId}_window_${windowIndex}`,
      wallId,
      position: opening.position,
      width: Math.max(opening.width, MIN_WINDOW_WIDTH),
      height: DEFAULT_WINDOW_HEIGHT,
      sillHeight: DEFAULT_WINDOW_SILL_HEIGHT,
    });
  });

  return { wall, doors, windows };
}

function parseRailingElement(railingElement: Element, scale: number, wallId: string): FloorplanWall | null {
  const polygonEl = railingElement.querySelector(':scope > polygon');
  if (!polygonEl) {
    return null;
  }

  const points = dedupClosingPoint(parsePoints(polygonEl.getAttribute('points') ?? ''));
  if (points.length < 3) {
    return null;
  }

  const centerline = wallCenterline(points);

  return {
    id: wallId,
    polygon: points.map(([x, y]): Point2 => [x * scale, y * scale]),
    start: [centerline.start[0] * scale, centerline.start[1] * scale],
    end: [centerline.end[0] * scale, centerline.end[1] * scale],
    thickness: resolveWallThickness(centerline.thickness * scale, 'unclassified'),
    isExterior: false,
  };
}

/**
 * Reads a Door/Window's own footprint polygon and returns where it sits along the
 * wall's centerline: `position` is the projected center (0..1), `width` is the meters
 * span between the projected extremes of its own corners.
 */
function parseOpeningPolygon(
  openingElement: Element,
  scale: number,
  wallStart: Point2,
  wallEnd: Point2,
  wallLength: number,
): { position: number; width: number } | null {
  const polygonEl = openingElement.querySelector(':scope > polygon');
  if (!polygonEl) {
    return null;
  }

  const points = parsePoints(polygonEl.getAttribute('points') ?? '');
  if (points.length < 3) {
    return null;
  }

  const pointsMeters = points.map(([x, y]): Point2 => [x * scale, y * scale]);
  const position = projectOntoSegment(polygonCenter(pointsMeters), wallStart, wallEnd);

  const tValues = pointsMeters.map((point) => projectOntoSegment(point, wallStart, wallEnd));
  const width = (Math.max(...tValues) - Math.min(...tValues)) * wallLength;

  return { position, width };
}

/**
 * A wall's SVG polygon is a quad: two long parallel edges (the wall faces) and two
 * end edges connecting them, mitered against whichever wall it joins. The end edges'
 * midpoints give the centerline start/end for any wall angle. Thickness is the
 * perpendicular distance between the two long faces — NOT the end edges' length (see
 * perpendicularDistance() for why that distinction matters).
 */
function wallCenterline(points: Point2[]): { start: Point2; end: Point2; thickness: number } {
  if (points.length < 4) {
    // No reliable quad to measure — resolveWallThickness() falls back for non-finite input.
    return { start: points[0], end: points[1] ?? points[0], thickness: NaN };
  }

  const edges: { length: number; a: Point2; b: Point2 }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    edges.push({ length: Math.hypot(b[0] - a[0], b[1] - a[1]), a, b });
  }

  const facingPairLength = edges[0].length + edges[2].length;
  const endPairLength = edges[1].length + edges[3].length;
  const [longA, longB, endA, endB] =
    facingPairLength >= endPairLength
      ? [edges[0], edges[2], edges[1], edges[3]]
      : [edges[1], edges[3], edges[0], edges[2]];

  return {
    start: [(endA.a[0] + endA.b[0]) / 2, (endA.a[1] + endA.b[1]) / 2],
    end: [(endB.a[0] + endB.b[0]) / 2, (endB.a[1] + endB.b[1]) / 2],
    thickness: perpendicularDistance(longA, longB),
  };
}

/**
 * True wall thickness is the perpendicular distance between the wall's two long
 * faces (longA/longB) — not the length of the edges connecting them, which are
 * mitered at whatever angle the adjoining wall meets this one (commonly 45° for a
 * square corner). A 45°-mitered end edge's length overstates thickness by a factor of
 * √2 (~41%) relative to the true perpendicular thickness; this was the cause of the
 * "walls look too thick" reports — about a third of the default plan's walls have a
 * mitered end and were rendering ~1.4× too thick before this fix.
 */
function perpendicularDistance(longA: { a: Point2; b: Point2 }, longB: { a: Point2; b: Point2 }): number {
  const dx = longA.b[0] - longA.a[0];
  const dy = longA.b[1] - longA.a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) {
    return NaN;
  }

  const nx = -dy / length;
  const ny = dx / length;
  const relX = longB.a[0] - longA.a[0];
  const relY = longB.a[1] - longA.a[1];
  return Math.abs(relX * nx + relY * ny);
}

type WallThicknessClassification = 'interior' | 'exterior' | 'unclassified';

/**
 * Keeps a wall's own SVG-derived thickness when it's finite and within a sane range
 * for a real wall; otherwise falls back to a classification-based default. `Wall`
 * elements are reliably classified interior/exterior from CubiCasa's own "External"
 * class (not a heuristic we invented); `Railing` elements have no such concept, so
 * they use the unclassified default.
 */
function resolveWallThickness(rawThicknessMeters: number, classification: WallThicknessClassification): number {
  if (
    Number.isFinite(rawThicknessMeters) &&
    rawThicknessMeters >= WALL_THICKNESS_SANITY_MIN_M &&
    rawThicknessMeters <= WALL_THICKNESS_SANITY_MAX_M
  ) {
    return rawThicknessMeters;
  }

  switch (classification) {
    case 'exterior':
      return DEFAULT_EXTERIOR_WALL_THICKNESS_M;
    case 'interior':
      return DEFAULT_INTERIOR_WALL_THICKNESS_M;
    default:
      return DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M;
  }
}

function projectOntoSegment(point: Point2, segStart: Point2, segEnd: Point2): number {
  const dx = segEnd[0] - segStart[0];
  const dy = segEnd[1] - segStart[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-8) {
    return 0.5;
  }
  const t = ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / lengthSq;
  return Math.max(0, Math.min(1, t));
}

function segmentLength(a: Point2, b: Point2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function polygonCenter(points: Point2[]): Point2 {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  return [cx / points.length, cy / points.length];
}

function parsePoints(pointsAttr: string): Point2[] {
  return pointsAttr
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return [x, y] as Point2;
    })
    .filter(([x, y]) => !isNaN(x) && !isNaN(y));
}

/** Some CubiCasa exports repeat the first point as the last one; drop it if so. */
function dedupClosingPoint(points: Point2[]): Point2[] {
  if (points.length > 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(last[0] - first[0]) < 0.01 && Math.abs(last[1] - first[1]) < 0.01) {
      return points.slice(0, -1);
    }
  }
  return points;
}

function boundingBoxCenter(points: Point2[]): Point2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function subtractPoint(point: Point2, offset: Point2): Point2 {
  return [point[0] - offset[0], point[1] - offset[1]];
}

function recenterFloorplan(walls: FloorplanWall[], rooms: FloorplanRoom[], outerPerimeter: Point2[]): void {
  const referencePoints = outerPerimeter.length >= 3 ? outerPerimeter : walls.flatMap((wall) => wall.polygon);
  if (referencePoints.length === 0) {
    return;
  }

  const offset = boundingBoxCenter(referencePoints);

  for (const wall of walls) {
    wall.polygon = wall.polygon.map((point) => subtractPoint(point, offset));
    wall.start = subtractPoint(wall.start, offset);
    wall.end = subtractPoint(wall.end, offset);
  }
  for (const room of rooms) {
    room.polygon = room.polygon.map((point) => subtractPoint(point, offset));
  }
  for (let i = 0; i < outerPerimeter.length; i++) {
    outerPerimeter[i] = subtractPoint(outerPerimeter[i], offset);
  }
}