import * as THREE from 'three';

import {
  DEFAULT_APPLIANCE_HEIGHT_M,
  DEFAULT_BASE_CABINET_HEIGHT_M,
  DEFAULT_WALL_CABINET_ELEVATION_M,
  DEFAULT_WALL_CABINET_HEIGHT_M,
} from '../../../../core/floorplan/fixture.constants';
import type { FloorplanFixture } from '../../../../core/floorplan/fixture.types';
import type { Floorplan, Point2 } from '../../../../core/floorplan/floorplan.types';
import type { MaterialId } from '../../../../core/materials/material.types';
import type { SemanticType } from '../viewer-3d.types';

const EPSILON = 1e-4;

export function generateProceduralFixtures(
  target: THREE.Group,
  floorplan: Floorplan,
  placeholderMaterial: THREE.Material,
): void {
  for (const fixture of floorplan.fixtures) {
    // ApplianceSpace is reserved semantic space, never an invented appliance mesh.
    if (fixture.type === 'APPLIANCE_SPACE' || fixture.type === 'UNKNOWN_SINK' || fixture.type === 'UNKNOWN') continue;
    const dimensions = fixtureVerticalDimensions(fixture);
    if (!dimensions) continue;
    const mesh = extrudeFootprint(fixture.footprint, dimensions.bottom, dimensions.top, placeholderMaterial);
    if (!mesh) continue;
    mesh.name = `fixture-${fixture.id}`;
    mesh.userData = {
      semanticType: 'fixture' satisfies SemanticType,
      fixtureId: fixture.id,
      fixtureType: fixture.type,
      roomId: fixture.roomId,
      materialId: dimensions.materialId,
      materialRole: dimensions.materialRole,
    };
    target.add(mesh);
  }
}

function fixtureVerticalDimensions(fixture: FloorplanFixture): {
  bottom: number;
  top: number;
  materialId: MaterialId;
  materialRole?: 'cabinet' | 'countertop';
} | undefined {
  const nominalHeight = fixture.height;
  const nominalElevation = fixture.elevation;
  switch (fixture.type) {
    case 'TOILET':
      return { bottom: 0, top: nominalHeight ?? 0.42, materialId: 'FIXTURE_CERAMIC_WHITE' };
    case 'SHOWER':
      return { bottom: 0.006, top: Math.min(nominalHeight ?? 0.05, 0.12), materialId: 'FIXTURE_CERAMIC_WHITE' };
    case 'BATHTUB':
      return { bottom: 0, top: nominalHeight ?? 0.55, materialId: 'FIXTURE_CERAMIC_WHITE' };
    case 'SHOWER_SCREEN':
      return { bottom: nominalElevation ?? 0, top: (nominalElevation ?? 0) + (nominalHeight ?? 1.9), materialId: 'FIXTURE_GLASS' };
    case 'BATHROOM_SINK':
    case 'KITCHEN_SINK':
    case 'DOUBLE_KITCHEN_SINK': {
      const top = nominalElevation ?? 0.88;
      return { bottom: Math.max(0, top - (nominalHeight ?? 0.12)), top, materialId: 'FIXTURE_CERAMIC_WHITE', materialRole: 'countertop' };
    }
    case 'BASE_CABINET':
      return { bottom: nominalElevation ?? 0, top: (nominalElevation ?? 0) + (nominalHeight ?? DEFAULT_BASE_CABINET_HEIGHT_M), materialId: 'FIXTURE_CABINET_NEUTRAL', materialRole: 'cabinet' };
    case 'WALL_CABINET': {
      const bottom = nominalElevation ?? DEFAULT_WALL_CABINET_ELEVATION_M;
      return { bottom, top: bottom + (nominalHeight ?? DEFAULT_WALL_CABINET_HEIGHT_M), materialId: 'FIXTURE_CABINET_NEUTRAL', materialRole: 'cabinet' };
    }
    case 'STOVE':
    case 'WASHING_MACHINE':
      return { bottom: nominalElevation ?? 0, top: (nominalElevation ?? 0) + (nominalHeight ?? DEFAULT_APPLIANCE_HEIGHT_M), materialId: 'FIXTURE_APPLIANCE' };
    case 'REFRIGERATOR':
      return { bottom: nominalElevation ?? 0, top: (nominalElevation ?? 0) + (nominalHeight ?? 1.85), materialId: 'FIXTURE_APPLIANCE' };
    default:
      return undefined;
  }
}

function extrudeFootprint(
  points: Point2[],
  bottom: number,
  top: number,
  material: THREE.Material,
): THREE.Mesh | undefined {
  if (points.length < 3 || top - bottom <= EPSILON) return undefined;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = bottom;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
