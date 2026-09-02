import type { MovementInputSource, MovementInputState } from './viewer-3d.types';

/** WASD + Space movement input. Implements MovementInputSource so a future touch/virtual-joystick source can be swapped in without touching PlayerController. */
export class KeyboardMovementInput implements MovementInputSource {
  private readonly state: MovementInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.setKeyState(event.code, true);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.setKeyState(event.code, false);
  };

  constructor(private readonly target: Document = document) {
    this.target.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('keyup', this.handleKeyUp);
  }

  getState(): MovementInputState {
    return this.state;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
  }

  private setKeyState(code: string, pressed: boolean): void {
    switch (code) {
      case 'KeyW':
        this.state.forward = pressed;
        break;
      case 'KeyS':
        this.state.backward = pressed;
        break;
      case 'KeyA':
        this.state.left = pressed;
        break;
      case 'KeyD':
        this.state.right = pressed;
        break;
      case 'Space':
        this.state.jump = pressed;
        break;
    }
  }
}
