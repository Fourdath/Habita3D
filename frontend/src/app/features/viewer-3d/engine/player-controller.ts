import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';

import {
  GRAVITY,
  JUMP_VELOCITY,
  OUT_OF_BOUNDS_Y,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_EYE_HEIGHT,
  PLAYER_SPEED_AIR,
  PLAYER_SPEED_GROUND,
} from './viewer-3d.constants';
import type { MovementInputSource } from './viewer-3d.types';

/** First-person player physics: capsule/Octree collision, gravity, and WASD + jump movement. */
export class PlayerController {
  readonly collider: Capsule;

  private readonly velocity = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private onFloor = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly worldOctree: Octree,
    private readonly input: MovementInputSource,
  ) {
    this.collider = new Capsule(
      new THREE.Vector3(0, PLAYER_CAPSULE_RADIUS, 0),
      new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0),
      PLAYER_CAPSULE_RADIUS,
    );
    this.camera.position.copy(this.collider.end);
  }

  update(deltaTime: number): void {
    this.applyInput(deltaTime);
    this.applyPhysics(deltaTime);
    this.resolveCollisions();
    this.respawnIfOutOfBounds();
    this.camera.position.copy(this.collider.end);
  }

  private applyInput(deltaTime: number): void {
    const state = this.input.getState();
    const speedDelta = deltaTime * (this.onFloor ? PLAYER_SPEED_GROUND : PLAYER_SPEED_AIR);

    if (state.forward) {
      this.velocity.add(this.getForwardVector().multiplyScalar(speedDelta));
    }
    if (state.backward) {
      this.velocity.add(this.getForwardVector().multiplyScalar(-speedDelta));
    }
    if (state.left) {
      this.velocity.add(this.getSideVector().multiplyScalar(-speedDelta));
    }
    if (state.right) {
      this.velocity.add(this.getSideVector().multiplyScalar(speedDelta));
    }
    if (state.jump && this.onFloor) {
      this.velocity.y = JUMP_VELOCITY;
    }
  }

  private applyPhysics(deltaTime: number): void {
    let damping = Math.exp(-4 * deltaTime) - 1;
    if (!this.onFloor) {
      this.velocity.y -= GRAVITY * deltaTime;
      damping *= 0.1;
    }
    this.velocity.addScaledVector(this.velocity, damping);

    const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime);
    this.collider.translate(deltaPosition);
  }

  private resolveCollisions(): void {
    const result = this.worldOctree.capsuleIntersect(this.collider);
    this.onFloor = false;

    if (result) {
      this.onFloor = result.normal.y > 0;

      if (!this.onFloor) {
        this.velocity.addScaledVector(result.normal, -result.normal.dot(this.velocity));
      }

      if (result.depth >= 1e-10) {
        this.collider.translate(result.normal.multiplyScalar(result.depth));
      }
    }
  }

  /**
   * Resets the player to the default spawn point with zero velocity and a level
   * look direction. Used both when falling out of bounds and when a new floor plan
   * is loaded at runtime (the previous position may no longer be valid geometry).
   */
  respawn(): void {
    this.collider.start.set(0, PLAYER_CAPSULE_RADIUS, 0);
    this.collider.end.set(0, PLAYER_EYE_HEIGHT, 0);
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(this.collider.end);
    this.camera.rotation.set(0, 0, 0);
  }

  private respawnIfOutOfBounds(): void {
    if (this.collider.end.y <= OUT_OF_BOUNDS_Y) {
      this.respawn();
    }
  }

  private getForwardVector(): THREE.Vector3 {
    this.camera.getWorldDirection(this.direction);
    this.direction.y = 0;
    this.direction.normalize();
    return this.direction;
  }

  private getSideVector(): THREE.Vector3 {
    this.camera.getWorldDirection(this.direction);
    this.direction.y = 0;
    this.direction.normalize();
    this.direction.cross(this.camera.up);
    return this.direction;
  }
}
