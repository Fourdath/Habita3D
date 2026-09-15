import * as THREE from 'three';

import type { FloorplanFixture } from '../../../../core/floorplan/fixture.types';
import type { Point2 } from '../../../../core/floorplan/floorplan.types';
import { normalizeDirection, pointInPolygon } from '../../../../core/floorplan/geometry-utils';
import type { MaterialId, SurfaceFinishRole } from '../../../../core/materials/material.types';
import { applyMetricBoxUvs } from '../materials/physical-uv-mapper';
import type { FinishResolver, MeshJob } from '../surface-mesh.types';

const COUNTERTOP_HEIGHT_M = 0.9;
const COUNTERTOP_THICKNESS_M = 0.04;
const TOE_KICK_HEIGHT_M = 0.1;
const TOE_KICK_INSET_M = 0.055;

/** Parts whose finish follows the style; everything else is a fixed fixture material. */
const ROLE_TO_FINISH: Record<string, SurfaceFinishRole> = {
  cabinet: 'CABINET',
  'cabinet-front': 'CABINET',
  countertop: 'COUNTERTOP',
  'toe-kick': 'TOE_KICK',
};

interface FixtureFrame {
  width: number;
  depth: number;
  center: Point2;
  rotationY: number;
  /** +1 when local +Z faces the fixture's front, -1 when it faces its back. */
  frontZ: 1 | -1;
}

/**
 * Recognisable primitives for each sanitary/kitchen fixture, sized and placed from the
 * SVG BoundaryPolygon — never from hand-tuned coordinates. Nothing is invented for
 * APPLIANCE_SPACE: it is reserved space, not an appliance.
 */
export function buildFixtureJobs(fixture: FloorplanFixture, resolveFinish: FinishResolver, neighbours: readonly FloorplanFixture[] = []): MeshJob[] {
  // Some exports encode a washbasin twice: a thin BaseCabinet slab and the Sink
  // at the same footprint. The basin already supplies this surface and its opening.
  if (fixture.type === 'BASE_CABINET' && (fixture.height ?? 0.9) <= 0.12
    && neighbours.some((other) => other.type === 'BATHROOM_SINK' && other.roomId === fixture.roomId
      && pointInPolygon(fixture.position, other.footprint) && pointInPolygon(other.position, fixture.footprint))) return [];
  const frame = fixtureFrame(fixture);
  if (!frame) return [];
  const { width, depth, center, rotationY, frontZ } = frame;
  const jobs: MeshJob[] = [];
  const support = neighbours.find((other) => other.id !== fixture.id && other.type === 'BASE_CABINET'
    && (other.height ?? 0.9) > 0.12 && other.roomId === fixture.roomId && pointInPolygon(fixture.position, other.footprint));
  const insetFixtures = fixture.type === 'BASE_CABINET' ? neighbours.filter((other) =>
    other.roomId === fixture.roomId && ['KITCHEN_SINK', 'DOUBLE_KITCHEN_SINK', 'BATHROOM_SINK', 'STOVE'].includes(other.type)
    && pointInPolygon(other.position, fixture.footprint)) : [];

  const push = (geometry: THREE.BufferGeometry, fixedMaterialId: MaterialId | null, role: string): void => {
    applyMetricBoxUvs(geometry);
    const finishRole = ROLE_TO_FINISH[role];
    const userData = {
      semanticType: 'fixture',
      finishRole,
      fixtureId: fixture.id,
      fixtureType: fixture.type,
      roomId: fixture.roomId,
      materialRole: role,
      materialId: fixedMaterialId,
    };
    jobs.push({
      geometry,
      materialId: finishRole ? resolveFinish(userData) : (fixedMaterialId ?? 'DEFAULT_WALL_NEUTRAL'),
      name: `fixture-${fixture.id}-${role}`,
      userData,
      position: [center[0], 0, -center[1]],
      rotationY,
    });
  };

  const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => {
    const geometry = new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01));
    geometry.translate(x, y, z);
    return geometry;
  };
  const cylinder = (
    radiusTop: number, radiusBottom: number, h: number, x: number, y: number, z: number, segments = 24,
  ): THREE.BufferGeometry => {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments);
    geometry.translate(x, y, z);
    return geometry;
  };

  const faucet = (top: number, height: number): void => {
    const backZ = -frontZ * (depth / 2 - 0.07);
    push(cylinder(0.016, 0.016, height, 0, top + height / 2, backZ, 12), 'FIXTURE_METAL_CHROME', 'trim');
    const reach = Math.min(depth * 0.3, 0.18);
    const spout = new THREE.CylinderGeometry(0.014, 0.014, reach, 12);
    spout.rotateX(Math.PI / 2);
    spout.translate(0, top + height - 0.015, backZ + frontZ * reach / 2);
    push(spout, 'FIXTURE_METAL_CHROME', 'trim');
  };

  switch (fixture.type) {
    case 'TOILET': {
      const bowlDepth = depth * 0.62;
      const tankDepth = depth - bowlDepth;
      const bowlZ = frontZ * (depth / 2 - bowlDepth / 2);
      const tankZ = -frontZ * (depth / 2 - tankDepth / 2);
      push(cylinder(width * 0.42, width * 0.3, 0.38, 0, 0.19, bowlZ, 20), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
      push(box(width * 0.86, 0.05, bowlDepth * 0.95, 0, 0.4, bowlZ), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
      push(box(width * 0.9, 0.42, tankDepth * 0.9, 0, 0.42, tankZ), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
      push(box(width * 0.2, 0.03, 0.05, width * 0.28, 0.65, tankZ), 'FIXTURE_METAL_CHROME', 'trim');
      break;
    }
    case 'BATHTUB': {
      push(box(width, 0.55, depth, 0, 0.275, 0), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
      push(box(width - 0.16, 0.36, depth - 0.16, 0, 0.42, 0), 'FIXTURE_CERAMIC_WHITE', 'sanitary-inner');
      push(cylinder(0.018, 0.018, 0.22, -width / 2 + 0.1, 0.66, -frontZ * (depth / 2 - 0.08), 12), 'FIXTURE_METAL_CHROME', 'trim');
      break;
    }
    case 'SHOWER': {
      // Small CubiCasa Shower footprints represent wall plumbing, not a shower tray.
      if (width >= 0.5 && depth >= 0.5) {
        push(box(width, 0.09, depth, 0, 0.045, 0), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
        push(cylinder(0.05, 0.05, 0.012, 0, 0.095, 0, 16), 'FIXTURE_METAL_CHROME', 'trim');
      }
      push(cylinder(0.016, 0.016, 1.9, -width / 2 + 0.09, 1.05, -frontZ * (depth / 2 - 0.07), 12), 'FIXTURE_METAL_CHROME', 'trim');
      push(cylinder(0.075, 0.075, 0.02, -width / 2 + 0.09, 2, -frontZ * (depth / 2 - 0.22), 16), 'FIXTURE_METAL_CHROME', 'trim');
      break;
    }
    case 'SHOWER_SCREEN': {
      const height = Math.min(fixture.height ?? 1.85, 2.4);
      const elevation = fixture.elevation ?? 0.09;
      const bottom = elevation + height <= 2.6 ? elevation : 0.09;
      push(box(width, height, depth, 0, bottom + height / 2, 0), 'FIXTURE_GLASS', 'glass');
      push(box(width, 0.03, depth, 0, bottom + height, 0), 'FIXTURE_METAL_CHROME', 'trim');
      break;
    }
    case 'BATHROOM_SINK': {
      const top = (fixture.elevation ?? 0) + (fixture.height ?? 0.86);
      push(basinRim(width, depth, 0.14, top, 0), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
      push(box(width * 0.7, 0.025, depth * 0.6, 0, top - 0.14, 0), 'FIXTURE_CERAMIC_WHITE', 'sanitary-inner');
      push(cylinder(0.055, 0.075, top - 0.16, 0, (top - 0.16) / 2, 0, 16), 'FIXTURE_CERAMIC_WHITE', 'sanitary');
      faucet(top, 0.16);
      break;
    }
    case 'KITCHEN_SINK':
    case 'DOUBLE_KITCHEN_SINK': {
      const top = (support ? (support.elevation ?? 0) + (support.height ?? COUNTERTOP_HEIGHT_M) : COUNTERTOP_HEIGHT_M) + 0.004;
      const bowls = fixture.type === 'DOUBLE_KITCHEN_SINK' ? 2 : 1;
      const bowlWidth = width / bowls;
      for (let index = 0; index < bowls; index++) {
        const x = -width / 2 + bowlWidth / 2 + index * bowlWidth;
        push(basinRim(bowlWidth, depth, 0.14, top, x), 'FIXTURE_METAL_CHROME', 'sink');
        push(box(bowlWidth * 0.7, 0.02, depth * 0.6, x, top - 0.15, 0), 'FIXTURE_METAL_CHROME', 'sink');
      }
      faucet(top, 0.26);
      if (support) break;
      const bodyHeight = top - 0.17 - TOE_KICK_HEIGHT_M;
      push(box(width - 0.02, bodyHeight, depth - 0.02, 0, TOE_KICK_HEIGHT_M + bodyHeight / 2, 0), null, 'cabinet');
      push(box(width - 0.02, TOE_KICK_HEIGHT_M, depth - TOE_KICK_INSET_M, 0, TOE_KICK_HEIGHT_M / 2, -frontZ * TOE_KICK_INSET_M / 2), null, 'toe-kick');
      break;
    }
    case 'BASE_CABINET': {
      // Body + countertop + toe kick, each with its own material: a base cabinet is not
      // a single prism, and the countertop is what makes it read as a kitchen.
      const top = (fixture.elevation ?? 0) + (fixture.height ?? COUNTERTOP_HEIGHT_M);
      const elevation = fixture.elevation ?? 0;
      // A thin elevated module is a shelf/counter, not a full cabinet to the floor.
      if ((fixture.height ?? COUNTERTOP_HEIGHT_M) <= 0.12) {
        push(box(width, fixture.height ?? 0.05, depth, 0, (elevation + top) / 2, 0), null, 'countertop');
        break;
      }
      const bodyBottom = elevation + TOE_KICK_HEIGHT_M;
      const bodyTop = top - COUNTERTOP_THICKNESS_M;
      push(insetFixtures.length ? cabinetWithOpenings(frame, bodyTop - bodyBottom, bodyBottom, insetFixtures) : box(width, bodyTop - bodyBottom, depth, 0, (bodyBottom + bodyTop) / 2, 0), null, 'cabinet');
      const modules = Math.max(1, Math.ceil(width / 0.9));
      for (let index = 0; index < modules; index++) {
        push(box(width / modules - 0.02, bodyTop - bodyBottom - 0.03, 0.012,
          -width / 2 + (index + 0.5) * width / modules, (bodyBottom + bodyTop) / 2, frontZ * (depth / 2 - 0.006)), null, 'cabinet-front');
      }
      push(box(width, TOE_KICK_HEIGHT_M, depth - TOE_KICK_INSET_M, 0, elevation + TOE_KICK_HEIGHT_M / 2, -frontZ * TOE_KICK_INSET_M / 2), null, 'toe-kick');
      push(insetFixtures.length ? cabinetWithOpenings(frame, COUNTERTOP_THICKNESS_M, top - COUNTERTOP_THICKNESS_M, insetFixtures) : box(width + 0.01, COUNTERTOP_THICKNESS_M, depth + 0.02, 0, top - COUNTERTOP_THICKNESS_M / 2, frontZ * 0.01), null, 'countertop');
      break;
    }
    case 'WALL_CABINET': {
      const bottom = fixture.elevation ?? 1.5;
      const height = fixture.height ?? 0.72;
      push(box(width, height, depth, 0, bottom + height / 2, 0), null, 'cabinet');
      const modules = Math.max(1, Math.ceil(width / 0.6));
      for (let index = 0; index < modules; index++) {
        push(box(width / modules - 0.02, height - 0.03, 0.012,
          -width / 2 + (index + 0.5) * width / modules, bottom + height / 2, frontZ * (depth / 2 - 0.006)), null, 'cabinet-front');
      }
      break;
    }
    case 'STOVE': {
      const height = (support ? (support.elevation ?? 0) + (support.height ?? 0.9) : fixture.height ?? 0.9) + 0.006;
      push(box(width, height - COUNTERTOP_THICKNESS_M, depth, 0, (height - COUNTERTOP_THICKNESS_M) / 2, 0), 'FIXTURE_APPLIANCE', 'appliance');
      push(box(width, COUNTERTOP_THICKNESS_M, depth, 0, height - COUNTERTOP_THICKNESS_M / 2, 0), 'FIXTURE_METAL_DARK', 'cooktop');
      for (const [dx, dz] of [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]]) {
        push(cylinder(0.075, 0.075, 0.008, dx * width, height + 0.004, dz * depth * frontZ, 16), 'FIXTURE_METAL_DARK', 'burner');
      }
      break;
    }
    case 'REFRIGERATOR': {
      const height = fixture.height ?? 1.8;
      push(box(width, height, depth, 0, height / 2, 0), 'FIXTURE_APPLIANCE', 'appliance');
      push(box(width - 0.04, 0.014, 0.012, 0, height * 0.62, frontZ * (depth / 2 + 0.007)), 'FIXTURE_METAL_DARK', 'trim');
      break;
    }
    case 'WASHING_MACHINE': {
      const height = fixture.height ?? 0.86;
      push(box(width, height, depth, 0, height / 2, 0), 'FIXTURE_APPLIANCE', 'appliance');
      const radius = Math.min(width, depth) * 0.28;
      push(cylinder(radius, radius, 0.02, 0, height * 0.55, frontZ * (depth / 2 + 0.01), 24), 'FIXTURE_GLASS', 'glass');
      break;
    }
    default:
      break;
  }

  return jobs;
}

/**
 * Local frame from the already-transformed BoundaryPolygon: width along its major axis,
 * depth along the perpendicular, and local +Z toward whatever the Direction group points
 * at. This is why a fixture never lands outside its own footprint.
 */
function fixtureFrame(fixture: FloorplanFixture): FixtureFrame | null {
  const points = fixture.footprint;
  if (points.length < 3) return null;
  const u = normalizeDirection([points[1][0] - points[0][0], points[1][1] - points[0][1]]);
  const v: Point2 = [-u[1], u[0]];
  const alongU = points.map((point) => point[0] * u[0] + point[1] * u[1]);
  const alongV = points.map((point) => point[0] * v[0] + point[1] * v[1]);
  const width = Math.max(...alongU) - Math.min(...alongU);
  const depth = Math.max(...alongV) - Math.min(...alongV);
  if (width < 0.02 || depth < 0.02) return null;

  const centerU = (Math.max(...alongU) + Math.min(...alongU)) / 2;
  const centerV = (Math.max(...alongV) + Math.min(...alongV)) / 2;
  const center: Point2 = [u[0] * centerU + v[0] * centerV, u[1] * centerU + v[1] * centerV];
  // With rotationY = atan2(u.y, u.x), local +Z corresponds to the plan vector -v.
  const forward = fixture.forwardDirection ?? v;
  const frontZ: 1 | -1 = forward[0] * -v[0] + forward[1] * -v[1] >= 0 ? 1 : -1;
  return { width, depth, center, rotationY: Math.atan2(u[1], u[0]), frontZ };
}

/** A recessed basin with an actual opening, so the worktop cannot hide the sink. */
function basinRim(width: number, depth: number, height: number, top: number, x: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-width * 0.35, -depth * 0.3);
  hole.lineTo(-width * 0.35, depth * 0.3);
  hole.lineTo(width * 0.35, depth * 0.3);
  hole.lineTo(width * 0.35, -depth * 0.3);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(x, top - height, 0);
  return geometry;
}

/** Cut actual openings in supporting cabinets; an inset sink must not z-fight with a solid worktop. */
function cabinetWithOpenings(frame: FixtureFrame, height: number, bottom: number, fixtures: readonly FloorplanFixture[]): THREE.BufferGeometry {
  const { width, depth, center, rotationY } = frame;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  const ux = Math.cos(rotationY), uy = Math.sin(rotationY);
  for (const fixture of fixtures) {
    const fixtureAxes = fixtureFrame(fixture);
    if (!fixtureAxes) continue;
    const fx = Math.cos(fixtureAxes.rotationY), fy = Math.sin(fixtureAxes.rotationY);
    const cutScale = fixture.type === 'STOVE' ? 0.99 : 0.74;
    const cutDepthScale = fixture.type === 'STOVE' ? 0.99 : 0.64;
    const hole = new THREE.Path();
    const points = fixture.footprint.map((point) => {
      const px = point[0] - fixture.position[0], py = point[1] - fixture.position[1];
      const along = (px * fx + py * fy) * cutScale;
      const across = (-px * fy + py * fx) * cutDepthScale;
      const dx = fixture.position[0] + along * fx - across * fy - center[0];
      const dy = fixture.position[1] + along * fy + across * fx - center[1];
      return [Math.max(-width / 2 + 0.005, Math.min(width / 2 - 0.005, dx * ux + dy * uy)),
        Math.max(-depth / 2 + 0.005, Math.min(depth / 2 - 0.005, -dx * uy + dy * ux))];
    });
    hole.moveTo(points[0][0], points[0][1]);
    for (const point of points.slice(1)) hole.lineTo(point[0], point[1]);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return geometry;
}
