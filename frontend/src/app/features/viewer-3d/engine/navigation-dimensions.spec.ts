import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeDoors } from '../../../core/floorplan/door-normalizer';
import { normalizeKitchenFixtures } from '../../../core/floorplan/kitchen-fixture-normalizer';
import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import type { Floorplan, FloorplanWall, Point2 } from '../../../core/floorplan/floorplan.types';
import type { FloorplanFixture } from '../../../core/floorplan/fixture.types';
import { pointInPolygon } from '../../../core/floorplan/geometry-utils';
import { buildFloorplanGroup } from './floorplan-geometry';
import { MaterialRegistry } from './materials/material-registry';
import { disposeObject3D } from './three-object-disposal';
import { PLAYER_CAPSULE_RADIUS, PLAYER_EYE_HEIGHT } from './viewer-3d.constants';
import { OverviewController } from './overview-controller';

const wall: FloorplanWall = { id: 'wall', start: [0, 0], end: [6, 0], polygon: [[0, -.1], [6, -.1], [6, .1], [0, .1]], thickness: .2, isExterior: false };
const empty: Floorplan = { walls: [wall], doors: [], windows: [], rooms: [], fixtures: [], outerPerimeter: [], scaleMetersPerUnit: 1 };
const fixture = (id: string, type: FloorplanFixture['type'], x: number, y: number, width: number, depth: number): FloorplanFixture => ({
  id, type, width, depth, position: [x + width / 2, y + depth / 2],
  footprint: [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]],
  rotation: Math.PI / 2, forwardDirection: [0, 1], sourceClasses: [], roomId: 'kitchen',
});

describe('passage and kitchen dimensions', () => {
  beforeEach(() => vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockImplementation(async () => new THREE.Texture()));
  afterEach(() => vi.restoreAllMocks());

  async function expectPassagesClear(plan: Floorplan): Promise<void> {
    const registry = new MaterialRegistry(1, () => ({ map: new THREE.Texture(), normal: null, roughness: null }));
    const { group } = await buildFloorplanGroup(plan, registry, 'none');
    const octree = new Octree().fromGraphNode(group);
    const collisions: string[] = [];
    for (const door of plan.doors) {
      const wall = plan.walls.find((w) => w.id === door.wallId)!;
      const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
      const length = Math.hypot(dx, dy);
      for (let step = -16; step <= 16; step++) {
        const offset = step * .025;
        const x = wall.start[0] + dx * door.position - dy / length * offset;
        const z = -(wall.start[1] + dy * door.position + dx / length * offset);
        const capsule = new Capsule(new THREE.Vector3(x, PLAYER_CAPSULE_RADIUS + .015, z), new THREE.Vector3(x, PLAYER_EYE_HEIGHT + .015, z), PLAYER_CAPSULE_RADIUS);
        const hit = octree.capsuleIntersect(capsule);
        if (hit && hit.depth > .001 && step === 0) {
          group.children.filter((child) => child instanceof THREE.Mesh).forEach((child) => {
            const contact = new Octree().fromGraphNode(child).capsuleIntersect(capsule);
            if (contact && contact.depth > .001) collisions.push(`${door.id}: ${child.name} ${JSON.stringify(child.userData)}`);
          });
        }
        if (hit && hit.depth > .001) collisions.push(`${door.id} at ${offset.toFixed(3)}: ${hit.depth.toFixed(3)}`);
      }
    }
    disposeObject3D(group, { keepMaterials: true });
    registry.dispose();
    expect(collisions).toEqual([]);
  }

  it('merges duplicate/overlapping door symbols and admits the real player capsule', async () => {
    const doors = normalizeDoors([
      { id: 'a', wallId: 'wall', position: .35, width: .45, height: 2 },
      { id: 'duplicate', wallId: 'wall', position: .35, width: .45, height: 2 },
      { id: 'overlap', wallId: 'wall', position: .4, width: .45, height: 2 },
      { id: 'b', wallId: 'wall', position: .8, width: .5, height: 2 },
    ], [wall]);
    expect(doors).toHaveLength(2);
    expect(doors[1].width).toBeCloseTo(.9);
    await expectPassagesClear({ ...empty, doors });
  });

  it('lets the player cross every door of the bundled house in both directions', async () => {
    const plan = parseFloorplan(readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf8'));
    expect(plan.doors.every((d) => d.width >= .6 && d.height === 2.1)).toBe(true);
    expect(plan.doors.filter((d) => d.width >= .899).length).toBeGreaterThan(5);
    await expectPassagesClear(plan);
  });

  it('keeps oversized upper cabinets and inset appliances within a standard counter', () => {
    const base = fixture('base', 'BASE_CABINET', 0, 0, 2.4, 1.6);
    const upper = { ...fixture('upper', 'WALL_CABINET', -.2, 0, 2.8, 1.5), height: 1.3, elevation: 1.1 };
    const sink = fixture('sink', 'KITCHEN_SINK', 1.3, .1, 1, .8);
    const stove = fixture('stove', 'STOVE', .1, .1, .8, .9);
    const fixtures = [base, upper, sink, stove];
    normalizeKitchenFixtures(fixtures);
    expect(base.depth).toBeCloseTo(.6);
    expect(base.height).toBeCloseTo(.9);
    expect(upper.depth).toBeCloseTo(.32);
    expect(upper.elevation! + upper.height!).toBeCloseTo(2.22);
    for (const part of [upper, sink, stove]) {
      expect(part.width).toBeLessThan(base.width);
      expect(part.footprint.every((p) => pointInPolygon(p, base.footprint))).toBe(true);
    }
    expect(sink.footprint[0][1]).toBeCloseTo(.02);
    expect(stove.footprint[0][1]).toBeCloseTo(.02);
    const once = structuredClone(fixtures);
    normalizeKitchenFixtures(fixtures);
    fixtures.forEach((f, index) => f.footprint.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(once[index].footprint[i][0]);
      expect(p[1]).toBeCloseTo(once[index].footprint[i][1]);
    }));
  });

  it('preserves wall anchoring for rotated furniture whose first edge describes depth', () => {
    const base = fixture('base', 'BASE_CABINET', 0, 0, 2, 1.4);
    base.footprint.push(base.footprint.shift()!);
    const rotate = ([x, y]: Point2): Point2 => [4 - y, 3 + x];
    base.footprint = base.footprint.map(rotate);
    base.position = rotate(base.position);
    base.forwardDirection = [-1, 0];
    normalizeKitchenFixtures([base]);
    expect(base.width).toBeCloseTo(2);
    expect(base.depth).toBeCloseTo(.6);
    expect(Math.max(...base.footprint.map(([x]) => x))).toBeCloseTo(4);
    expect(Math.min(...base.footprint.map(([x]) => x))).toBeCloseTo(3.4);
  });
});

describe('overview camera', () => {
  it('frames the house, reveals rooms and restores ceilings when returning to walking', () => {
    const controller = new OverviewController(document.createElement('canvas'));
    const house = new THREE.Group();
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(12, .08, 8));
    ceiling.userData['semanticType'] = 'ceiling-structure';
    house.add(ceiling);
    controller.resize(.6);
    controller.setHouse(house);
    controller.setEnabled(true);
    expect(ceiling.visible).toBe(false);
    controller.frame(true);
    const direction = controller.camera.getWorldDirection(new THREE.Vector3());
    expect(direction.y).toBeLessThan(-.999);
    for (const x of [-6, 6]) for (const z of [-4, 4]) {
      const projected = new THREE.Vector3(x, 0, z).project(controller.camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
    controller.setEnabled(false);
    expect(ceiling.visible).toBe(true);
    controller.dispose();
    disposeObject3D(house);
  });
});
