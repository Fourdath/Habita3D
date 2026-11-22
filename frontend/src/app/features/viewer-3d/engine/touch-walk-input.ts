import type { PerspectiveCamera } from 'three';
import type { MovementInputSource, MovementInputState } from './viewer-3d.types';

export type WalkDirection = Exclude<keyof MovementInputState, 'jump'>;

const RADIANS_PER_PIXEL = 0.006;
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export class TouchWalkInput implements MovementInputSource {
  private active = false;
  private readonly state: MovementInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };
  private drag: { id: number; x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLElement, private readonly camera: PerspectiveCamera) {
    canvas.addEventListener('pointerdown', this.beginDrag);
    canvas.addEventListener('pointermove', this.moveDrag);
    canvas.addEventListener('pointerup', this.endDrag);
    canvas.addEventListener('pointercancel', this.endDrag);
    canvas.addEventListener('lostpointercapture', this.endDrag);
    window.addEventListener('blur', this.reset);
  }

  get enabled(): boolean {
    return this.active;
  }

  getState(): MovementInputState {
    return this.state;
  }

  setEnabled(enabled: boolean): void {
    this.active = enabled;
    if (!enabled) this.reset();
  }

  setDirection(direction: WalkDirection, pressed: boolean): void {
    this.state[direction] = this.active && pressed;
  }

  dispose(): void {
    this.setEnabled(false);
    this.canvas.removeEventListener('pointerdown', this.beginDrag);
    this.canvas.removeEventListener('pointermove', this.moveDrag);
    this.canvas.removeEventListener('pointerup', this.endDrag);
    this.canvas.removeEventListener('pointercancel', this.endDrag);
    this.canvas.removeEventListener('lostpointercapture', this.endDrag);
    window.removeEventListener('blur', this.reset);
  }

  private readonly reset = (): void => {
    const drag = this.drag;
    this.drag = null;
    if (drag && this.canvas.hasPointerCapture?.(drag.id)) this.canvas.releasePointerCapture(drag.id);
    this.state.forward = false;
    this.state.backward = false;
    this.state.left = false;
    this.state.right = false;
  };

  private readonly beginDrag = (event: PointerEvent): void => {
    if (!this.active || this.drag || event.pointerType !== 'touch') return;
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly moveDrag = (event: PointerEvent): void => {
    if (!this.active || this.drag?.id !== event.pointerId) return;
    this.camera.rotation.y -= (event.clientX - this.drag.x) * RADIANS_PER_PIXEL;
    const pitch = this.camera.rotation.x - (event.clientY - this.drag.y) * RADIANS_PER_PIXEL;
    this.camera.rotation.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
  };

  private readonly endDrag = (event: PointerEvent): void => {
    if (this.drag?.id === event.pointerId) this.drag = null;
  };
}
