import {
  DEFAULT_EXTERIOR_WALL_THICKNESS_M,
  DEFAULT_INTERIOR_WALL_THICKNESS_M,
  DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M,
  WALL_THICKNESS_SANITY_MAX_M,
  WALL_THICKNESS_SANITY_MIN_M,
} from './floorplan.constants';
import { parseFloorplan } from './cubicasa-parser';

const SCALE = 0.01;

function svgWithWall(wallClass: string, points: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg"><g class="Floorplan Floor-1">' +
    `<g class="${wallClass}"><polygon points="${points}"/></g>` +
    '</g></svg>'
  );
}

/** Builds a rectangle `length` units long and `thickness` units thick, axis-aligned (no miter). */
function straightRectPoints(length: number, thickness: number): string {
  return `0,0 ${length},0 ${length},${thickness} 0,${thickness}`;
}

describe('wall thickness resolution', () => {
  it('converts SVG units to meters using the given scale', () => {
    // A plain, non-mitered 10-unit-thick wall: 10 * 0.01 = 0.10 m exactly.
    const svg = svgWithWall('Wall', straightRectPoints(300, 10));
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.walls[0].thickness).toBeCloseTo(0.1, 10);
  });

  it('preserves a valid SVG-measured thickness instead of overriding it with a default', () => {
    // Same real wall polygon that originally exposed the mitered-corner bug: two long
    // faces 24 SVG units apart, connected by 45°-mitered ends whose own length
    // (~33.94) must NOT be used as the thickness — the true value is 24u -> 0.24 m,
    // deliberately different from every DEFAULT_*_WALL_THICKNESS_M fallback so this
    // test fails if a fallback silently replaced the real measurement.
    const svg = svgWithWall('Wall External', '193.19,232.83 732.94,232.83 756.94,208.83 169.10,208.83');
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.walls[0].thickness).toBeCloseTo(0.24, 2);
    expect(plan.walls[0].thickness).not.toBeCloseTo(0.34, 1); // the old, buggy (√2-inflated) value
  });

  it('does not use a 45°-mitered end edge length as the thickness (the original bug)', () => {
    // A square, right-angle corner mitered at 45° on both ends of a 12-unit-thick wall.
    // Old formula: (13*sqrt(2))*... effectively ~1.41x inflation. New formula must read
    // the true 12u -> 0.12 m perpendicular gap between the long faces.
    const svg = svgWithWall('Wall', '12,0 112,0 124,12 0,12');
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.walls[0].thickness).toBeCloseTo(0.12, 2);
  });

  it('falls back to the exterior default when the measured thickness is below the sanity minimum', () => {
    const tooThin = (WALL_THICKNESS_SANITY_MIN_M / SCALE) * 0.5; // half the minimum, in SVG units
    const svg = svgWithWall('Wall External', straightRectPoints(300, tooThin));
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.walls[0].thickness).toBe(DEFAULT_EXTERIOR_WALL_THICKNESS_M);
  });

  it('falls back to the interior default when the measured thickness is above the sanity maximum', () => {
    const tooThick = (WALL_THICKNESS_SANITY_MAX_M / SCALE) * 3; // 3x the maximum, in SVG units
    const svg = svgWithWall('Wall', straightRectPoints(300, tooThick));
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.walls[0].thickness).toBe(DEFAULT_INTERIOR_WALL_THICKNESS_M);
  });

  it('falls back to the unclassified default for a Railing with an out-of-range thickness', () => {
    const tooThick = (WALL_THICKNESS_SANITY_MAX_M / SCALE) * 3;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g class="Floorplan Floor-1">' +
      `<g class="Railing"><polygon points="${straightRectPoints(300, tooThick)}"/></g>` +
      '</g></svg>';
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.walls[0].thickness).toBe(DEFAULT_UNCLASSIFIED_WALL_THICKNESS_M);
  });

  it('keeps a thickness exactly at the sanity bounds instead of treating it as out of range', () => {
    const atMin = WALL_THICKNESS_SANITY_MIN_M / SCALE;
    const atMax = WALL_THICKNESS_SANITY_MAX_M / SCALE;

    const minPlan = parseFloorplan(svgWithWall('Wall', straightRectPoints(300, atMin)), {
      scaleMetersPerUnit: SCALE,
    });
    const maxPlan = parseFloorplan(svgWithWall('Wall', straightRectPoints(300, atMax)), {
      scaleMetersPerUnit: SCALE,
    });

    expect(minPlan.walls[0].thickness).toBeCloseTo(WALL_THICKNESS_SANITY_MIN_M, 10);
    expect(maxPlan.walls[0].thickness).toBeCloseTo(WALL_THICKNESS_SANITY_MAX_M, 10);
  });

  it('keeps door/window alignment (position along the wall) unaffected by the thickness fix', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g class="Floorplan Floor-1">' +
      '<g class="Wall External">' +
      '<polygon points="193.19,232.83 732.94,232.83 756.94,208.83 169.10,208.83"/>' +
      '<g class="Door Swing Beside"><polygon points="453.41,232.83 511.88,232.83 511.88,208.83 453.41,208.83"/></g>' +
      '</g></g></svg>';
    const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });

    expect(plan.doors).toHaveLength(1);
    // Regardless of the wall-thickness fix, the door's position/width come from its
    // own polygon projected onto the (unchanged) centerline — same numbers as before.
    expect(plan.doors[0].position).toBeGreaterThan(0);
    expect(plan.doors[0].position).toBeLessThan(1);
    expect(plan.doors[0].width).toBeCloseTo(0.7, 2);
  });

  it('never produces NaN, zero, or negative thickness for a degenerate wall polygon', () => {
    const degenerateCases = [
      // A triangle (fewer than 4 points): wallCenterline can't measure a quad at all.
      svgWithWall('Wall', '0,0 300,0 150,0.001'),
      // A 4-point polygon with a zero-length "long" edge (two duplicate points).
      svgWithWall('Wall External', '0,0 0,0 300,10 0,10'),
    ];

    for (const svg of degenerateCases) {
      const plan = parseFloorplan(svg, { scaleMetersPerUnit: SCALE });
      expect(plan.walls).toHaveLength(1);
      const { thickness } = plan.walls[0];
      expect(Number.isFinite(thickness)).toBe(true);
      expect(thickness).toBeGreaterThan(0);
    }
  });
});
