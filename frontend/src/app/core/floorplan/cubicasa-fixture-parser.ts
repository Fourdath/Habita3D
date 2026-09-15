import type { FixtureType, FloorplanFixture } from './fixture.types';
import type { Point2 } from './floorplan.types';
import { normalizeDirection, parsePointsAttribute, polygonCenter, subtract } from './geometry-utils';
import { applyMatrix, cumulativeTransform } from './svg-transform';

/** Longest-prefix-first: 'DoubleSink' must win over 'Sink', 'ShowerScreen' over 'Shower'. */
const CLASS_TO_FIXTURE_TYPE: ReadonlyArray<readonly [string, FixtureType]> = [
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

export function parseFixtures(document: Document, scale: number): FloorplanFixture[] {
  const fixtures: FloorplanFixture[] = [];
  const groupIds = new Map<Element, string>();

  document.querySelectorAll('g.FixedFurniture').forEach((element, index) => {
    const sourceClasses = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    const type = CLASS_TO_FIXTURE_TYPE.find(([className]) => sourceClasses.includes(className))?.[1];
    if (!type) return;

    const boundary = element.querySelector(':scope > g.BoundaryPolygon > polygon');
    if (!boundary) return;
    const local = parsePointsAttribute(boundary.getAttribute('points') ?? '');
    if (local.length < 3) return;

    const matrix = cumulativeTransform(boundary);
    const footprint = local.map((point) => scalePoint(applyMatrix(matrix, point), scale));
    const position = polygonCenter(footprint);
    const edgeU = subtract(footprint[1], footprint[0]);
    const edgeV = subtract(footprint[2] ?? footprint[0], footprint[1]);

    let forward = readDirection(element, matrix, scale, position);
    if (!forward || Math.hypot(forward[0], forward[1]) < 1e-8) forward = normalizeDirection(edgeV);

    const nominal = parseDescription(element.querySelector(':scope > desc')?.textContent ?? '', scale);

    fixtures.push({
      id: `fixture_${index}`,
      type,
      sourceClasses,
      footprint,
      position,
      rotation: Math.atan2(forward[1], forward[0]),
      forwardDirection: forward,
      width: Math.hypot(edgeU[0], edgeU[1]),
      depth: Math.hypot(edgeV[0], edgeV[1]),
      height: nominal.height,
      elevation: nominal.elevation,
      groupId: resolveGroupId(element, groupIds),
    });
  });

  return fixtures;
}

function readDirection(element: Element, matrix: ReturnType<typeof cumulativeTransform>, scale: number, position: Point2): Point2 | undefined {
  const directionPolygon = element.querySelector(':scope > g.Direction polygon');
  if (!directionPolygon) return undefined;
  const points = parsePointsAttribute(directionPolygon.getAttribute('points') ?? '');
  if (points.length < 3) return undefined;
  const local = polygonCenter(points);
  return normalizeDirection(subtract(scalePoint(applyMatrix(cumulativeTransform(directionPolygon), local), scale), position));
}

function resolveGroupId(element: Element, groupIds: Map<Element, string>): string | undefined {
  const set = element.closest('g.FixedFurnitureSet');
  if (!set) return undefined;
  let groupId = groupIds.get(set);
  if (!groupId) {
    groupId = set.getAttribute('id') || `fixture-set_${groupIds.size}`;
    groupIds.set(set, groupId);
  }
  return groupId;
}

/** CubiCasa writes nominal Width/Height/Depth/Elevation in the <desc> of each fixture. */
function parseDescription(text: string, scale: number): { height?: number; elevation?: number } {
  const values = new Map<string, number>();
  for (const match of text.matchAll(/(Width|Height|Depth|Elevation)\s*:\s*(-?\d+(?:\.\d+)?)/gi)) {
    values.set(match[1].toLowerCase(), Number(match[2]) * scale);
  }
  return { height: values.get('height'), elevation: values.get('elevation') };
}

const scalePoint = (point: Point2, scale: number): Point2 => [point[0] * scale, point[1] * scale];
