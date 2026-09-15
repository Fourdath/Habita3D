import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import type { Floorplan, FloorplanWall } from '../../../core/floorplan/floorplan.types';
import type { FloorplanFixture } from '../../../core/floorplan/fixture.types';
import { resolveFloorplanSpawn } from '../../../core/floorplan/floorplan-spawn';
import { pointInPolygon } from '../../../core/floorplan/geometry-utils';
import { buildFloorplanGroup } from './floorplan-geometry';
import { buildFixtureJobs } from './fixtures/procedural-fixture-builder';
import { InteriorStyleManager } from './interior-style/interior-style-manager';
import { MaterialRegistry } from './materials/material-registry';
import { planSegmentBoxGeometry } from './wall-geometry-primitives';

const wall: FloorplanWall = { id: 'long', start: [0, 0], end: [6, 0], thickness: 0.1, isExterior: true, polygon: [[0, -.05], [6, -.05], [6, .05], [0, .05]] };
const plan: Floorplan = {
  scaleMetersPerUnit: 1, walls: [wall], doors: [], windows: [], fixtures: [],
  outerPerimeter: [[0, -.05], [6, -.05], [6, 3], [0, 3]],
  rooms: [
    { id: 'bath', name: 'Bath', type: 'Bath', polygon: [[0, .05], [2, .05], [2, 3], [0, 3]], semantic: { type: 'BATHROOM', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' } },
    { id: 'bed', name: 'Bedroom', type: 'Bedroom', polygon: [[2, .05], [6, .05], [6, 3], [2, 3]], semantic: { type: 'DRY', confidence: 1, inferenceSource: 'CUBICASA_ROOM_TYPE' } },
  ],
};
const fixture = (type: FloorplanFixture['type']): FloorplanFixture => ({
  id: 'f', type, sourceClasses: [], footprint: [[0, 0], [.6, 0], [.6, .5], [0, .5]], position: [.3, .25], width: .6, depth: .5, rotation: 0,
});
const registry = () => new MaterialRegistry(1, () => ({ map: new THREE.Texture(), normal: new THREE.Texture(), roughness: null }));

describe('engine migration regressions', () => {
  beforeEach(() => vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockImplementation(async () => new THREE.Texture()));
  afterEach(() => vi.restoreAllMocks());

  it('keeps bathroom tile in its room through style changes, with a separate exterior face', async () => {
    const materials = registry();
    const built = await buildFloorplanGroup(plan, materials, 'none');
    const manager = new InteriorStyleManager(materials);
    const meshes = built.group.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    const geometries = meshes.map((mesh) => mesh.geometry);
    for (const style of ['nordic', 'industrial', 'none', 'nordic'] as const) {
      await manager.applyStyle(style, built.group);
      expect(meshes.map((mesh) => mesh.geometry)).toEqual(geometries);
      const tiles = meshes.filter((mesh) => mesh.userData['finishRole'] === 'BATHROOM_WAINSCOT');
      expect(tiles.length).toBeGreaterThan(0);
      for (const tile of tiles) {
        tile.geometry.computeBoundingBox();
        expect(tile.geometry.boundingBox!.max.x).toBeCloseTo(2);
        expect(tile.geometry.boundingBox!.max.y).toBeCloseTo(2.1);
        expect(tile.userData['roomId']).toBe('bath');
      }
      const exterior = meshes.find((mesh) => mesh.userData['finishRole'] === 'EXTERIOR')!;
      const bedroom = meshes.find((mesh) => mesh.userData['finishRole'] === 'DRY_WALL' && mesh.userData['roomId'] === 'bed')!;
      expect(exterior.material).not.toBe(bedroom.material);
      expect(tiles[0].material).not.toBe(exterior.material);
    }
    expect(built.manifest.wallFaces.filter((face) => face.roomId === 'bath').reduce((sum, face) => sum + face.wainscotAreaM2, 0)).toBeCloseTo(4.2);
    for (const mesh of meshes) mesh.geometry.dispose();
    materials.dispose();
  });

  it('places and rotates baseboards/backsplash on their segment instead of at the origin', () => {
    const geometry = planSegmentBoxGeometry([4, 2], [4, 5], .6, .012, 1.2);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(4);
    expect(center.y).toBeCloseTo(1.2);
    expect(center.z).toBeCloseTo(-3.5);
    expect(geometry.boundingBox!.getSize(new THREE.Vector3()).z).toBeCloseTo(3);
    geometry.dispose();
  });

  it('keeps a zero-elevation washbasin at its specified counter height with an open basin', () => {
    const sink = { ...fixture('BATHROOM_SINK'), elevation: 0, height: .9 };
    const jobs = buildFixtureJobs(sink, () => 'DEFAULT_WALL_NEUTRAL');
    const rim = jobs.find((job) => job.userData['materialRole'] === 'sanitary')!;
    rim.geometry.computeBoundingBox();
    expect(rim.geometry.boundingBox!.max.y).toBeCloseTo(.9);
    const mesh = new THREE.Mesh(rim.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld();
    expect(new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    mesh.material.dispose();
    jobs.forEach((job) => job.geometry.dispose());
  });

  it('preserves an elevated shelf and the long axis of a shower screen', () => {
    const shelf = buildFixtureJobs({ ...fixture('BASE_CABINET'), elevation: 1.05, height: .05 }, () => 'DEFAULT_WALL_NEUTRAL');
    expect(shelf).toHaveLength(1);
    shelf[0].geometry.computeBoundingBox();
    expect(shelf[0].geometry.boundingBox!.min.y).toBeCloseTo(1.05);
    const screen = buildFixtureJobs({ ...fixture('SHOWER_SCREEN'), footprint: [[0, 0], [.025, 0], [.025, .8], [0, .8]], height: 1.8, elevation: 1.35 }, () => 'DEFAULT_WALL_NEUTRAL');
    screen[0].geometry.computeBoundingBox();
    expect(screen[0].geometry.boundingBox!.getSize(new THREE.Vector3()).z).toBeCloseTo(.8);
    expect(screen[0].geometry.boundingBox!.max.y).toBeLessThan(2.6);
    [...shelf, ...screen].forEach((job) => job.geometry.dispose());
  });

  it('does not invent appliances in reserved spaces', () => {
    expect(buildFixtureJobs(fixture('APPLIANCE_SPACE'), () => 'DEFAULT_WALL_NEUTRAL')).toEqual([]);
  });

  it('spawns inside a room and outside fixtures in the real demo', () => {
    const parsed = parseFloorplan(readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf8'));
    const spawn = resolveFloorplanSpawn(parsed, .35);
    expect(parsed.rooms.some((room) => pointInPolygon(spawn, room.polygon))).toBe(true);
    expect(parsed.fixtures.some((item) => pointInPolygon(spawn, item.footprint))).toBe(false);
    expect(new Set(parsed.fixtures.map((item) => item.id)).size).toBe(parsed.fixtures.length);
  });
});

describe('inset kitchen and bathroom fixtures', () => {
  it('cuts supporting worktops and does not duplicate the sink cabinet', () => {
    const cabinet = { ...fixture('BASE_CABINET'), id: 'support', height: .9 };
    const sink = { ...fixture('KITCHEN_SINK'), id: 'basin' };
    const cabinets = buildFixtureJobs(cabinet, () => 'DEFAULT_WALL_NEUTRAL', [cabinet, sink]);
    const sinkJobs = buildFixtureJobs(sink, () => 'DEFAULT_WALL_NEUTRAL', [cabinet, sink]);
    expect(sinkJobs.some((job) => job.userData['materialRole'] === 'cabinet')).toBe(false);
    const countertop = cabinets.find((job) => job.userData['materialRole'] === 'countertop')!;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(countertop.geometry, material);
    mesh.updateMatrixWorld();
    expect(new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    [...cabinets, ...sinkJobs].forEach((job) => job.geometry.dispose());
    material.dispose();
  });

  it('removes only a thin vanity slab overlapping its basin', () => {
    const slab = { ...fixture('BASE_CABINET'), id: 'slab', elevation: 1.05, height: .05 };
    const basin = { ...fixture('BATHROOM_SINK'), id: 'basin' };
    expect(buildFixtureJobs(slab, () => 'DEFAULT_WALL_NEUTRAL', [slab, basin])).toEqual([]);
    const standalone = buildFixtureJobs(slab, () => 'DEFAULT_WALL_NEUTRAL', [slab]);
    expect(standalone).toHaveLength(1);
    standalone.forEach((job) => job.geometry.dispose());
  });
});
