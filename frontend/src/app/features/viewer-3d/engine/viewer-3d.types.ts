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
 * so later systems (especially the interior-style material application) can find
 * "the walls", "the floor" or another finish without depending on
 * traversal/children[] order.
 */
export type SemanticType =
  | 'wall'
  | 'exteriorWall'
  | 'floor'
  | 'ceiling'
  | 'baseboard'
  | 'doorFrame'
  | 'window'
  | 'windowFrame'
  | 'lightFixture'
  | 'roomLight';
