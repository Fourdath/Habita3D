import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Independent camera: inspecting the model never moves the walking player. */
export class OverviewController {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly controls: OrbitControls;
  private house: THREE.Object3D | null = null;
  private active = false;
  private readonly hidden = new Map<THREE.Object3D, boolean>();

  constructor(canvas: HTMLElement) {
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.screenSpacePanning = true;
  }

  setHouse(house: THREE.Object3D | null): void {
    this.restoreCeilings();
    this.house = house;
    this.frame();
    if (this.active) this.hideCeilings();
  }

  setEnabled(enabled: boolean): void {
    this.active = enabled;
    this.controls.enabled = enabled;
    if (enabled) this.hideCeilings();
    else this.restoreCeilings();
  }

  frame(top = false): void {
    if (!this.house) return;
    const bounds = new THREE.Box3().setFromObject(this.house);
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const halfFov = Math.min(THREE.MathUtils.degToRad(this.camera.fov / 2),
      Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
    const distance = Math.max(4, sphere.radius / Math.sin(halfFov) * 1.12);
    this.controls.target.copy(sphere.center);
    const direction = top ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(1, 1.5, 1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.lookAt(sphere.center);
    this.controls.minDistance = 1;
    this.controls.maxDistance = Math.max(40, distance * 4);
    this.camera.far = Math.max(1000, distance * 8);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.saveState();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(): void { if (this.active) this.controls.update(); }

  dispose(): void {
    this.restoreCeilings();
    this.controls.dispose();
  }

  private hideCeilings(): void {
    this.house?.traverse((object) => {
      if (!['ceiling-structure', 'room-ceiling', 'lightFixture'].includes(object.userData['semanticType'])) return;
      if (!this.hidden.has(object)) this.hidden.set(object, object.visible);
      object.visible = false;
    });
  }

  private restoreCeilings(): void {
    for (const [object, visible] of this.hidden) object.visible = visible;
    this.hidden.clear();
  }
}
