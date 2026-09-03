import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

import { FloorplanSceneManager } from './floorplan-scene-manager';

function cubicasaSvg(wallPoints: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg"><g class="Floorplan Floor-1">' +
    `<g class="Wall"><polygon points="${wallPoints}"/></g>` +
    '</g></svg>'
  );
}

const PLAN_A = cubicasaSvg('0,0 400,0 400,20 0,20');
const PLAN_B = cubicasaSvg('0,0 300,0 300,300 0,300 0,0 300,20 300,300 0,300');

/**
 * Octree.build() distributes triangles from the root into `subTrees`, emptying the
 * root's own `triangles` array in the process — so counting collision data means
 * summing recursively rather than reading `octree.triangles.length` directly.
 */
function countOctreeTriangles(node: Octree): number {
  return node.triangles.length + node.subTrees.reduce((sum, sub) => sum + countOctreeTriangles(sub), 0);
}

describe('FloorplanSceneManager', () => {
  it('loads a floor plan, adding its geometry under the given parent', () => {
    const collidables = new THREE.Group();
    const manager = new FloorplanSceneManager(collidables);

    manager.load(PLAN_A);

    expect(manager.currentGroup).not.toBeNull();
    expect(collidables.children).toContain(manager.currentGroup);
    expect(manager.currentGroup!.children.length).toBeGreaterThan(0);
  });

  it('replaces the previous scenario on a second load: disposes old meshes, swaps groups', () => {
    const collidables = new THREE.Group();
    const manager = new FloorplanSceneManager(collidables);

    manager.load(PLAN_A);
    const firstGroup = manager.currentGroup!;
    const firstMesh = firstGroup.children[0] as THREE.Mesh;
    const disposeSpy = vi.spyOn(firstMesh.geometry, 'dispose');

    manager.load(PLAN_B);

    expect(disposeSpy).toHaveBeenCalled();
    expect(collidables.children).not.toContain(firstGroup);
    expect(collidables.children).toContain(manager.currentGroup);
    expect(manager.currentGroup).not.toBe(firstGroup);
  });

  it('throws and leaves the current scenario untouched when the SVG has no walls', () => {
    const collidables = new THREE.Group();
    const manager = new FloorplanSceneManager(collidables);

    manager.load(PLAN_A);
    const firstGroup = manager.currentGroup;

    expect(() => manager.load('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toThrow();

    expect(manager.currentGroup).toBe(firstGroup);
    expect(collidables.children).toContain(firstGroup);
  });

  it('dispose() removes and frees the current group', () => {
    const collidables = new THREE.Group();
    const manager = new FloorplanSceneManager(collidables);

    manager.load(PLAN_A);
    const group = manager.currentGroup!;
    const disposeSpy = vi.spyOn((group.children[0] as THREE.Mesh).geometry, 'dispose');

    manager.dispose();

    expect(disposeSpy).toHaveBeenCalled();
    expect(collidables.children).not.toContain(group);
    expect(manager.currentGroup).toBeNull();
  });

  it('composes with other collidable geometry (e.g. terrain) sharing the same parent for one combined Octree rebuild', () => {
    // Viewer3DEngine feeds ONE shared "collidables" group to both FloorplanSceneManager
    // and EnvironmentManager, then rebuilds the Octree once from that group — this is
    // what makes house + terrain (and later furniture) collide correctly together.
    const collidables = new THREE.Group();
    const manager = new FloorplanSceneManager(collidables);
    manager.load(PLAN_A);

    const terrainMesh = new THREE.Mesh(new THREE.BoxGeometry(50, 0.3, 50), new THREE.MeshStandardMaterial());
    collidables.add(terrainMesh);

    const octree = new Octree();
    octree.fromGraphNode(collidables);

    expect(countOctreeTriangles(octree)).toBeGreaterThan(0);
  });
});
