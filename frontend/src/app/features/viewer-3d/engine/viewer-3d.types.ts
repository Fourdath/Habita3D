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

/**
 * Stable identifier stamped on every generated house mesh's `userData.semanticType`,
 * so later systems (the interior style engine's material application, furniture
 * placement validation) can find "the walls" or "the floor" without depending on
 * traversal/children[] order.
 */
export type SemanticType = 'wall' | 'floor' | 'door' | 'window';
