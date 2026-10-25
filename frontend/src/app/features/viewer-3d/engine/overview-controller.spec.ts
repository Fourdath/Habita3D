import * as THREE from 'three';
import { OverviewController } from './overview-controller';

function house(): THREE.Group {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, .2, 8), new THREE.MeshBasicMaterial());
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(10, .2, 8), new THREE.MeshBasicMaterial());
  ceiling.position.y = 2.6;
  ceiling.userData['semanticType'] = 'ceiling-structure';
  const roomCeiling = ceiling.clone();
  roomCeiling.userData['semanticType'] = 'room-ceiling';
  roomCeiling.visible = false;
  group.add(floor, ceiling, roomCeiling);
  return group;
}

describe('OverviewController', () => {
  let overview: OverviewController;
  let model: THREE.Group;
  beforeEach(() => {
    overview = new OverviewController(document.createElement('canvas'));
    model = house();
    overview.setEnabled(true);
    overview.setHouse(model);
  });
  afterEach(() => {
    overview.dispose();
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
    });
  });
  it('opens the house for inspection and restores the original ceiling visibility for walking', () => {
    expect(model.children[1].visible).toBe(false);
    overview.setEnabled(false);
    expect(model.children[1].visible).toBe(true);
    expect(model.children[2].visible).toBe(false);
    overview.setEnabled(true);
    expect(model.children[1].visible).toBe(false);
  });
  it('zooms and recenters the model while keeping the whole house within the camera frustum', () => {
    overview.resize(1.4);
    overview.frame();
    const centered = overview.camera.position.clone();
    overview.zoom(.8);
    expect(overview.camera.position.distanceTo(centered)).toBeGreaterThan(0);
    overview.frame();
    expect(overview.camera.position.distanceTo(centered)).toBeLessThan(.001);
    overview.camera.updateMatrixWorld();
    const bounds = new THREE.Box3().setFromObject(model);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(overview.camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
        }
      }
    }
  });
  it('supports a top view and disables zoom during the walkthrough', () => {
    overview.frame(true);
    const direction = overview.camera.getWorldDirection(new THREE.Vector3());
    expect(direction.y).toBeLessThan(-.99);
    overview.setEnabled(false);
    const position = overview.camera.position.clone();
    overview.zoom(.8);
    expect(overview.camera.position.equals(position)).toBe(true);
  });
});
