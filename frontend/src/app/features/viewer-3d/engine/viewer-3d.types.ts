export type ViewerStatus = 'loading' | 'ready' | 'error';

export interface Viewer3DEngineCallbacks {
  onReady?(): void;
  onError?(error: unknown): void;
  onPointerLockChange?(locked: boolean): void;
}

/**
 * Per-frame movement intent, decoupled from the device that produces it so keyboard
 * input can later be joined (or replaced) by a touch-based virtual joystick without
 * PlayerController changes.
 */
export interface MovementInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface MovementInputSource {
  getState(): MovementInputState;
  dispose(): void;
}
