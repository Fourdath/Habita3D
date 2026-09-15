import {
  DEFAULT_DOOR_HEIGHT, DEFAULT_EXTERIOR_WALL_THICKNESS_M, DEFAULT_INTERIOR_WALL_THICKNESS_M,
  DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M, DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_SILL_HEIGHT,
  FLOORPLAN_SCALE_METERS_PER_UNIT, MIN_DOOR_WIDTH, MIN_WINDOW_WIDTH,
  WALL_THICKNESS_SANITY_MAX_M, WALL_THICKNESS_SANITY_MIN_M,
} from './floorplan.constants';
import { parseFixtures } from './cubicasa-fixture-parser';
import { assignFixturesToRooms, resolveAmbiguousSinks } from './fixture-room-resolver';
import { detectOuterPerimeter } from './floorplan-perimeter';
import type {
  Floorplan, FloorplanDoor, FloorplanRoom, FloorplanWall, FloorplanWindow, Point2,
} from './floorplan.types';
import type { FloorplanFixture } from './fixture.types';
import {
  dedupeClosingPoint, distance, parsePointsAttribute, polygonCenter, projectT, subtract,
} from './geometry-utils';
import { resolveAllRoomSemantics } from './room-semantic-resolver';
import { EXCLUDED_ROOM_TYPES, classifyRoomType, isLivingRoomType } from './room-type-classification';
import { applyMatrix, cumulativeTransform } from './svg-transform';
import { resolveAllWallConstructions } from '../construction/wall-construction-resolver';
import { resolveKitchenRuns } from './kitchen-run-resolver';
import { normalizeDoors } from './door-normalizer';
import { normalizeKitchenFixtures } from './kitchen-fixture-normalizer';

type WallClassification = 'interior' | 'exterior' | 'unclassified';

interface ParsedWallElement {
  wall: FloorplanWall;
  doors: FloorplanDoor[];
  windows: FloorplanWindow[];
}

export interface ParseFloorplanOptions { scaleMetersPerUnit: number }

export function parseFloorplan(svgText: string, options: number | ParseFloorplanOptions = FLOORPLAN_SCALE_METERS_PER_UNIT): Floorplan {
  const scale = typeof options === 'number' ? options : options.scaleMetersPerUnit;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('La escala del plano debe ser positiva.');
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (document.querySelector('parsererror')) throw new Error('El archivo SVG no es válido.');
  const rooms = parseRooms(document, scale);
  const fixtures = parseFixtures(document, scale);
  const walls: FloorplanWall[] = [];
  const doors: FloorplanDoor[] = [];
  const windows: FloorplanWindow[] = [];
  let wallIndex = 0;

  document.querySelectorAll('g[class*="Wall"]').forEach((element) => {
    if (!(element.getAttribute('class') ?? '').split(/\s+/).includes('Wall')) return;
    // Nested Wall groups describe the same wall twice; only the outermost one counts.
    const parentWall = element.parentElement?.closest('g[class*="Wall"]');
    if (parentWall && parentWall !== element) return;
    const parsed = parseWallElement(element, scale, `wall_${wallIndex}`);
    if (!parsed) return;
    walls.push(parsed.wall);
    doors.push(...parsed.doors);
    windows.push(...parsed.windows);
    wallIndex++;
  });

  document.querySelectorAll('g.Railing').forEach((element) => {
    const wall = parseRailing(element, scale, `wall_${wallIndex}`);
    if (!wall) return;
    walls.push(wall);
    wallIndex++;
  });

  const outerPerimeter: Point2[] = detectOuterPerimeter(document).map(([x, y]): Point2 => [x * scale, y * scale]);

  recenter(walls, rooms, fixtures, outerPerimeter);
  assignFixturesToRooms(fixtures, rooms);
  resolveAllRoomSemantics(rooms, fixtures);
  resolveAmbiguousSinks(fixtures, rooms);
  normalizeKitchenFixtures(fixtures);

  const floorplan: Floorplan = { scaleMetersPerUnit: scale, walls, doors: normalizeDoors(doors, walls), windows, rooms, fixtures, outerPerimeter };
  floorplan.wallConstructions = resolveAllWallConstructions(floorplan);
  floorplan.kitchenRuns = resolveKitchenRuns(floorplan, floorplan.wallConstructions);
  return floorplan;
}

function parseRooms(document: Document, scale: number): FloorplanRoom[] {
  const rooms: FloorplanRoom[] = [];
  let index = 0;
  document.querySelectorAll('g[class*="Space"]').forEach((element) => {
    if (element.closest('.FixedFurniture') || element.closest('.SelectionControls')) return;
    const tokens = (element.getAttribute('class') ?? '').split(/\s+/);
    const type = tokens.slice(tokens.indexOf('Space') + 1).join(' ');
    if (EXCLUDED_ROOM_TYPES.has(type)) return;
    const polygonElement = element.querySelector(':scope > polygon');
    if (!polygonElement) return;
    const points = transformedPoints(polygonElement);
    if (points.length < 3) return;

    rooms.push({
      id: `room_${index++}`,
      name: type || 'Room',
      type,
      polygon: points.map(([x, y]): Point2 => [x * scale, y * scale]),
      semantic: classifyRoomType(type),
      isLiving: isLivingRoomType(type),
    });
  });
  return rooms;
}

function parseWallElement(element: Element, scale: number, wallId: string): ParsedWallElement | null {
  const isExterior = (element.getAttribute('class') ?? '').includes('External');
  const polygonElement = element.querySelector(':scope > polygon');
  if (!polygonElement) return null;
  const raw = transformedPoints(polygonElement);
  if (raw.length < 3) return null;

  const centerline = wallCenterline(raw);
  const start: Point2 = [centerline.start[0] * scale, centerline.start[1] * scale];
  const end: Point2 = [centerline.end[0] * scale, centerline.end[1] * scale];
  const length = distance(start, end);

  const wall: FloorplanWall = {
    id: wallId,
    polygon: raw.map(([x, y]): Point2 => [x * scale, y * scale]),
    start,
    end,
    thickness: resolveThickness(centerline.thickness * scale, isExterior ? 'exterior' : 'interior'),
    isExterior,
  };

  const doors: FloorplanDoor[] = [];
  element.querySelectorAll(':scope > g[class*="Door"]').forEach((doorElement, index) => {
    const opening = parseOpening(doorElement, scale, start, end, length);
    if (!opening) return;
    doors.push({
      id: `${wallId}_door_${index}`,
      wallId,
      position: opening.position,
      width: Math.max(opening.width, MIN_DOOR_WIDTH),
      height: DEFAULT_DOOR_HEIGHT,
    });
  });

  const windows: FloorplanWindow[] = [];
  element.querySelectorAll(':scope > g[class*="Window"]').forEach((windowElement, index) => {
    const opening = parseOpening(windowElement, scale, start, end, length);
    if (!opening) return;
    windows.push({
      id: `${wallId}_window_${index}`,
      wallId,
      position: opening.position,
      width: Math.max(opening.width, MIN_WINDOW_WIDTH),
      height: DEFAULT_WINDOW_HEIGHT,
      sillHeight: DEFAULT_WINDOW_SILL_HEIGHT,
    });
  });

  return { wall, doors, windows };
}

function parseRailing(element: Element, scale: number, wallId: string): FloorplanWall | null {
  const polygonElement = element.querySelector(':scope > polygon');
  if (!polygonElement) return null;
  const points = transformedPoints(polygonElement);
  if (points.length < 3) return null;
  const centerline = wallCenterline(points);
  return {
    id: wallId,
    polygon: points.map(([x, y]): Point2 => [x * scale, y * scale]),
    start: [centerline.start[0] * scale, centerline.start[1] * scale],
    end: [centerline.end[0] * scale, centerline.end[1] * scale],
    thickness: resolveThickness(centerline.thickness * scale, 'unclassified'),
    isExterior: false,
    isRailing: true,
  };
}

interface Edge { length: number; a: Point2; b: Point2 }

/**
 * Centerline and thickness from the wall's own 4-point polygon: the two long edges are
 * the wall faces, the two short ones its ends. Thickness is the perpendicular distance
 * between the faces, so mitered corners do not inflate it.
 */
function wallCenterline(points: Point2[]): { start: Point2; end: Point2; thickness: number } {
  if (points.length < 4) {
    return { start: points[0], end: points[1] ?? points[0], thickness: NaN };
  }
  const edges: Edge[] = [];
  for (let index = 0; index < 4; index++) {
    const a = points[index];
    const b = points[(index + 1) % 4];
    edges.push({ length: Math.hypot(b[0] - a[0], b[1] - a[1]), a, b });
  }
  const facing = edges[0].length + edges[2].length;
  const ends = edges[1].length + edges[3].length;
  const [longA, longB, endA, endB] = facing >= ends
    ? [edges[0], edges[2], edges[1], edges[3]]
    : [edges[1], edges[3], edges[0], edges[2]];

  return {
    start: [(endA.a[0] + endA.b[0]) / 2, (endA.a[1] + endA.b[1]) / 2],
    end: [(endB.a[0] + endB.b[0]) / 2, (endB.a[1] + endB.b[1]) / 2],
    thickness: perpendicularDistance(longA, longB),
  };
}

function perpendicularDistance(longA: Edge, longB: Edge): number {
  const dx = longA.b[0] - longA.a[0];
  const dy = longA.b[1] - longA.a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return NaN;
  return Math.abs((longB.a[0] - longA.a[0]) * (-dy / length) + (longB.a[1] - longA.a[1]) * (dx / length));
}

function resolveThickness(measured: number, classification: WallClassification): number {
  if (Number.isFinite(measured) && measured >= WALL_THICKNESS_SANITY_MIN_M && measured <= WALL_THICKNESS_SANITY_MAX_M) {
    return measured;
  }
  if (classification === 'exterior') return DEFAULT_EXTERIOR_WALL_THICKNESS_M;
  if (classification === 'interior') return DEFAULT_INTERIOR_WALL_THICKNESS_M;
  return DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M;
}

function parseOpening(
  element: Element, scale: number, wallStart: Point2, wallEnd: Point2, wallLength: number,
): { position: number; width: number } | null {
  const polygonElement = element.querySelector(':scope > polygon');
  if (!polygonElement) return null;
  const points = transformedPoints(polygonElement);
  if (points.length < 3) return null;
  const meters = points.map(([x, y]): Point2 => [x * scale, y * scale]);
  const parameters = meters.map((point) => projectT(point, wallStart, wallEnd));
  return {
    position: projectT(polygonCenter(meters), wallStart, wallEnd),
    width: (Math.max(...parameters) - Math.min(...parameters)) * wallLength,
  };
}

/** Centers the plan on the origin so the camera, lights and shadows stay well-behaved. */
function recenter(
  walls: FloorplanWall[], rooms: FloorplanRoom[], fixtures: FloorplanFixture[], perimeter: Point2[],
): void {
  const reference = perimeter.length >= 3 ? perimeter : walls.flatMap((wall) => wall.polygon);
  if (reference.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of reference) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
const origin: Point2 = [(minX + maxX) / 2, (minY + maxY) / 2];

  for (const fixture of fixtures) {
    fixture.position = subtract(fixture.position, origin);
    fixture.footprint = fixture.footprint.map((point) => subtract(point, origin));
  }
  for (const wall of walls) {
    wall.polygon = wall.polygon.map((point) => subtract(point, origin));
    wall.start = subtract(wall.start, origin);
    wall.end = subtract(wall.end, origin);
  }
  for (const room of rooms) {
    room.polygon = room.polygon.map((point) => subtract(point, origin));
  }
  for (let index = 0; index < perimeter.length; index++) {
    perimeter[index] = subtract(perimeter[index], origin);
  }
}
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



function transformedPoints(element: Element): Point2[] {
  const matrix = cumulativeTransform(element);
  return dedupeClosingPoint(parsePointsAttribute(element.getAttribute('points') ?? ''))
    .map((point) => applyMatrix(matrix, point));
}
