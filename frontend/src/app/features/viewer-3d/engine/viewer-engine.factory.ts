import { InjectionToken } from '@angular/core';
import { Viewer3DEngine } from './viewer-3d-engine';
import type { Viewer3DEngineCallbacks } from './viewer-3d.types';

export type ViewerEngine = Pick<Viewer3DEngine,
  'dispose' | 'setViewMode' | 'requestPointerLock' | 'frameOverview' | 'zoomOverview' |
  'loadFloorplanFromSvgText' | 'applyInteriorStyle' | 'getBudget' | 'getModelSummary' | 'getSceneRooms' | 'setRoomFloorSelections'>;

/** Angular boundary: the page can be exercised without a WebGL context. */
export const VIEWER_ENGINE_FACTORY = new InjectionToken<
  (container: HTMLElement, callbacks: Viewer3DEngineCallbacks) => ViewerEngine
>('VIEWER_ENGINE_FACTORY', {
  providedIn: 'root',
  factory: () => (container, callbacks) => new Viewer3DEngine(container, callbacks),
});
