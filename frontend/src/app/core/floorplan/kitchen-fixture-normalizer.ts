import type { FloorplanFixture } from './fixture.types';
import type { Point2 } from './floorplan.types';
import { normalizeDirection, pointInPolygon } from './geometry-utils';

interface Frame { u: Point2; front: Point2; width: number; depth: number; center: Point2 }
const dot = (a: Point2, b: Point2): number => a[0] * b[0] + a[1] * b[1];

function frame(fixture: FloorplanFixture): Frame {
  const [a, b] = fixture.footprint;
  let u = normalizeDirection([b[0] - a[0], b[1] - a[1]]);
  // Some exporters start BoundaryPolygon on the depth edge. Direction determines
  // the front; snap to an edge rather than using its slightly skewed arrow angle.
  if (fixture.forwardDirection && Math.abs(dot(u, fixture.forwardDirection)) > 0.707) u = [-u[1], u[0]];
  let front: Point2 = [-u[1], u[0]];
  if (fixture.forwardDirection && dot(front, fixture.forwardDirection) < 0) front = [-front[0], -front[1]];
  const widths = fixture.footprint.map((p) => dot(p, u));
  const depths = fixture.footprint.map((p) => dot(p, front));
  const midU = (Math.min(...widths) + Math.max(...widths)) / 2;
  const midV = (Math.min(...depths) + Math.max(...depths)) / 2;
  return { u, front, width: Math.max(...widths) - Math.min(...widths), depth: Math.max(...depths) - Math.min(...depths),
    center: [u[0] * midU + front[0] * midV, u[1] * midU + front[1] * midV] };
}

function apply(fixture: FloorplanFixture, source: Frame, width: number, depth: number, center?: Point2): void {
  // Preserve the back edge against the wall when reducing excessive depth.
  const position: Point2 = center ?? [source.center[0] + source.front[0] * (depth - source.depth) / 2,
    source.center[1] + source.front[1] * (depth - source.depth) / 2];
  const v: Point2 = [-source.u[1], source.u[0]];
  fixture.footprint = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]): Point2 => [
    position[0] + source.u[0] * x * width / 2 + v[0] * y * depth / 2,
    position[1] + source.u[1] * x * width / 2 + v[1] * y * depth / 2,
  ]);
  fixture.position = position;
  fixture.width = width;
  fixture.depth = depth;
  fixture.forwardDirection = source.front;
  fixture.rotation = Math.atan2(source.front[1], source.front[0]);
}

/** Keeps kitchen modules at usable dimensions without scaling the house or its walls. */
export function normalizeKitchenFixtures(fixtures: FloorplanFixture[]): void {
  const valid = fixtures.filter((f) => f.footprint.length >= 3);
  const originals = new Map(valid.map((f) => [f.id, { ...f, footprint: [...f.footprint] }]));
  const bases = valid.filter((f) => f.type === 'BASE_CABINET' && (f.height ?? 0.9) > 0.12);
  for (const base of bases) {
    const original = frame(base);
    apply(base, original, original.width, Math.min(original.depth, 0.6));
    base.height = 0.9;
    base.elevation = 0;
  }
  for (const fixture of valid) {
    if (!['WALL_CABINET', 'KITCHEN_SINK', 'DOUBLE_KITCHEN_SINK', 'STOVE', 'REFRIGERATOR', 'WASHING_MACHINE'].includes(fixture.type)) continue;
    const original = frame(originals.get(fixture.id)!);
    const upper = fixture.type === 'WALL_CABINET';
    const inset = ['KITCHEN_SINK', 'DOUBLE_KITCHEN_SINK', 'STOVE'].includes(fixture.type);
    const support = (upper || inset) ? bases.filter((base) => {
      const raw = originals.get(base.id)!;
      return base.roomId === fixture.roomId && Math.abs(dot(frame(raw).u, original.u)) > 0.95
        && (pointInPolygon(fixture.position, raw.footprint) || pointInPolygon(raw.position, fixture.footprint));
    }).sort((a, b) => b.width - a.width)[0] : undefined;
    const maxWidth = fixture.type === 'DOUBLE_KITCHEN_SINK' ? 1.2 : upper ? 1.2 : fixture.type === 'KITCHEN_SINK' ? 0.8 : 0.65;
    const maxDepth = upper ? 0.32 : inset ? 0.56 : 0.65;
    let width = Math.min(original.width, maxWidth);
    let depth = Math.min(original.depth, maxDepth);
    if (support) {
      const baseFrame = frame(support);
      // Upper runs may span multiple fronts, but never extend beyond their worktop.
      width = Math.min(upper ? original.width : width, support.width - 0.02);
      depth = Math.min(depth, support.depth - 0.04);
      const relative: Point2 = [original.center[0] - baseFrame.center[0], original.center[1] - baseFrame.center[1]];
      const offset = Math.max(-(support.width - width) / 2, Math.min((support.width - width) / 2, dot(relative, baseFrame.u)));
      const across = -(support.depth - depth) / 2 + (upper ? 0 : 0.02);
      apply(fixture, baseFrame, width, depth, [baseFrame.center[0] + baseFrame.u[0] * offset + baseFrame.front[0] * across,
        baseFrame.center[1] + baseFrame.u[1] * offset + baseFrame.front[1] * across]);
    } else apply(fixture, original, width, depth);
    fixture.height = upper ? 0.72 : fixture.type === 'REFRIGERATOR' ? 1.8 : fixture.type === 'WASHING_MACHINE' ? 0.85 : 0.9;
    fixture.elevation = upper ? 1.5 : 0;
  }
}
