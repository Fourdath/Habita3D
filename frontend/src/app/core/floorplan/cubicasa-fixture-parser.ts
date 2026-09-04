import type { FixtureType, FloorplanFixture } from './fixture.types';
import type { Point2 } from './floorplan.types';
import { polygonCenter } from './geometry-utils';

interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const CLASS_TO_TYPE: ReadonlyArray<[string, FixtureType]> = [
  ['Toilet', 'TOILET'],
  ['ShowerScreen', 'SHOWER_SCREEN'],
  ['Shower', 'SHOWER'],
  ['Bathtub', 'BATHTUB'],
  ['RoundSink', 'UNKNOWN_SINK'],
  ['DoubleSink', 'UNKNOWN_SINK'],
  ['Sink', 'UNKNOWN_SINK'],
  ['BaseCabinet', 'BASE_CABINET'],
  ['WallCabinet', 'WALL_CABINET'],
  ['IntegratedStove', 'STOVE'],
  ['Refrigerator', 'REFRIGERATOR'],
  ['WashingMachine', 'WASHING_MACHINE'],
  ['SpaceForAppliance2', 'APPLIANCE_SPACE'],
  ['SpaceForAppliance', 'APPLIANCE_SPACE'],
];

export function parseCubiCasaFixtures(doc: Document, scaleMetersPerUnit: number): FloorplanFixture[] {
  const fixtures: FloorplanFixture[] = [];
  const groupIds = new Map<Element, string>();

  doc.querySelectorAll('g.FixedFurniture').forEach((element, index) => {
    const sourceClasses = classTokens(element);
    const fixtureType = CLASS_TO_TYPE.find(([className]) => sourceClasses.includes(className))?.[1];
    if (!fixtureType) return;

    const boundary = element.querySelector(':scope > g.BoundaryPolygon > polygon');
    if (!boundary) return;
    const localFootprint = parsePoints(boundary.getAttribute('points') ?? '');
    if (localFootprint.length < 3) return;

    const transform = cumulativeTransform(element);
    const footprint = localFootprint.map((point) => scalePoint(applyMatrix(transform, point), scaleMetersPerUnit));
    const position = polygonCenter(footprint);
    const edgeX = subtract(footprint[1], footprint[0]);
    const edgeY = subtract(footprint[2] ?? footprint[0], footprint[1]);

    const directionPolygon = element.querySelector(':scope > g.Direction polygon');
    let forwardDirection: Point2 | undefined;
    if (directionPolygon) {
      const directionLocal = polygonCenter(parsePoints(directionPolygon.getAttribute('points') ?? ''));
      const directionWorld = scalePoint(applyMatrix(transform, directionLocal), scaleMetersPerUnit);
      forwardDirection = normalize(subtract(directionWorld, position));
    }
    if (!forwardDirection || vectorLength(forwardDirection) < 1e-8) {
      forwardDirection = normalize(edgeY);
    }

    const nominal = parseDescription(element.querySelector(':scope > desc')?.textContent ?? '', scaleMetersPerUnit);
    const setElement = element.closest('g.FixedFurnitureSet');
    let groupId: string | undefined;
    if (setElement) {
      groupId = groupIds.get(setElement);
      if (!groupId) {
        groupId = setElement.getAttribute('id') || `fixture-set_${groupIds.size}`;
        groupIds.set(setElement, groupId);
      }
    }

    fixtures.push({
      id: element.getAttribute('id') || `fixture_${index}`,
      type: fixtureType,
      sourceClasses,
      footprint,
      position,
      rotation: Math.atan2(forwardDirection[1], forwardDirection[0]),
      forwardDirection,
      width: vectorLength(edgeX),
      depth: vectorLength(edgeY),
      height: nominal.height,
      elevation: nominal.elevation,
      groupId,
    });
  });

  return fixtures;
}

export function recenterFixtures(fixtures: FloorplanFixture[], offset: Point2): void {
  for (const fixture of fixtures) {
    fixture.position = subtract(fixture.position, offset);
    fixture.footprint = fixture.footprint.map((point) => subtract(point, offset));
  }
}

function classTokens(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function parseDescription(text: string, scale: number): { height?: number; elevation?: number } {
  const values = new Map<string, number>();
  for (const match of text.matchAll(/(Width|Height|Depth|Elevation)\s*:\s*(-?\d+(?:\.\d+)?)/gi)) {
    values.set(match[1].toLowerCase(), Number(match[2]) * scale);
  }
  return {
    height: values.get('height'),
    elevation: values.get('elevation'),
  };
}

function cumulativeTransform(element: Element): Matrix2D {
  const ancestors: Element[] = [];
  let current: Element | null = element;
  while (current) {
    ancestors.unshift(current);
    current = current.parentElement;
  }
  return ancestors.reduce(
    (result, ancestor) => multiply(result, parseTransform(ancestor.getAttribute('transform') ?? '')),
    IDENTITY,
  );
}

function parseTransform(value: string): Matrix2D {
  let result = IDENTITY;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi)) {
    const values = match[2].trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    let operation = IDENTITY;
    switch (match[1].toLowerCase()) {
      case 'matrix':
        if (values.length >= 6) {
          operation = { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
        }
        break;
      case 'translate':
        operation = { ...IDENTITY, e: values[0] ?? 0, f: values[1] ?? 0 };
        break;
      case 'scale':
        operation = { ...IDENTITY, a: values[0] ?? 1, d: values[1] ?? values[0] ?? 1 };
        break;
      case 'rotate': {
        const radians = ((values[0] ?? 0) * Math.PI) / 180;
        const rotation: Matrix2D = { a: Math.cos(radians), b: Math.sin(radians), c: -Math.sin(radians), d: Math.cos(radians), e: 0, f: 0 };
        if (values.length >= 3) {
          operation = multiply(
            multiply({ ...IDENTITY, e: values[1], f: values[2] }, rotation),
            { ...IDENTITY, e: -values[1], f: -values[2] },
          );
        } else operation = rotation;
        break;
      }
    }
    result = multiply(result, operation);
  }
  return result;
}

function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function applyMatrix(matrix: Matrix2D, point: Point2): Point2 {
  return [matrix.a * point[0] + matrix.c * point[1] + matrix.e, matrix.b * point[0] + matrix.d * point[1] + matrix.f];
}

function parsePoints(value: string): Point2[] {
  return value.trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as Point2)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function scalePoint(point: Point2, scale: number): Point2 {
  return [point[0] * scale, point[1] * scale];
}

function subtract(left: Point2, right: Point2): Point2 {
  return [left[0] - right[0], left[1] - right[1]];
}

function vectorLength(vector: Point2): number {
  return Math.hypot(vector[0], vector[1]);
}

function normalize(vector: Point2): Point2 {
  const length = vectorLength(vector);
  return length > 1e-8 ? [vector[0] / length, vector[1] / length] : [1, 0];
}
