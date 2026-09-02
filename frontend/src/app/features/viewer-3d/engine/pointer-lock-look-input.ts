import * as THREE from 'three';

import { MOUSE_LOOK_SENSITIVITY } from './viewer-3d.constants';

const HALF_PI = Math.PI / 2;

/**
 * Mouse-look via the Pointer Lock API. Kept separate from keyboard movement input
 * (see MovementInputSource) since "look" and "move" are independent axes that a future
 * touch control scheme would drive differently (drag-to-look vs. virtual joystick).
 * The browser exits pointer lock on its own when Escape is pressed; this class only
 * reacts to that via `pointerlockchange` to report the new state to the caller.
 */
export class PointerLockLookInput {
  private locked = false;

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) {
      return;
    }
    this.camera.rotation.y -= event.movementX / MOUSE_LOOK_SENSITIVITY;
    this.camera.rotation.x -= event.movementY / MOUSE_LOOK_SENSITIVITY;
    this.camera.rotation.x = Math.max(-HALF_PI, Math.min(HALF_PI, this.camera.rotation.x));
  };

  private readonly handlePointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element;
    this.onLockChange(this.locked);
  };

  private readonly handlePointerLockError = (): void => {
    this.locked = false;
    this.onLockChange(false);
  };

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    this.camera.rotation.order = 'YXZ';
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  requestLock(): void {
    this.element.requestPointerLock();
  }

  dispose(): void {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    if (document.pointerLockElement === this.element) {
      document.exitPointerLock();
    }
  }
}
