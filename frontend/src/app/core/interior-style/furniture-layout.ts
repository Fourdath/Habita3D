import type { FurniturePlacement } from './interior-style.types';

/**
 * Manual furniture layout for the default plan only (public/assets/floorplans/model.svg,
 * CubiCasa "high_quality_17") — positions were picked from that plan's actual parsed
 * room coordinates (world X = plan X, world Z = -plan Y), not guessed blindly:
 *
 *   room_4 "Bedroom"     bbox x[-3.25, 0.21]  y[0.39, 3.49]
 *   room_3 "Kitchen"     bbox x[ 1.22, 3.26]  y[-2.08, 0.25]
 *   room_1 "Entry Lobby" bbox x[ 0.30, 1.72]  y[-0.40, 2.74]
 *
 * Every item keeps at least ~0.3m clearance from the nearest wall. This layout is
 * meaningless for any other floor plan — furniture-layout-builder.ts only applies it
 * when the currently-loaded plan is the default one (see Viewer3DEngine).
 */
export const DEFAULT_FURNITURE_LAYOUT: FurniturePlacement[] = [
  // Bedroom (room_4) — bed against the far wall, nightstands flanking its open side.
  { category: 'bed', roomId: 'room_4', position: [-2.5, 0, -1.9], rotationY: Math.PI / 2 },
  { category: 'nightstand', roomId: 'room_4', position: [-1.7, 0, -1.0], rotationY: 0 },
  { category: 'nightstand', roomId: 'room_4', position: [-1.7, 0, -2.8], rotationY: 0 },

  // Kitchen (room_3) — small dining nook.
  { category: 'table', roomId: 'room_3', position: [2.2, 0, 0.9], rotationY: 0 },
  { category: 'chair', roomId: 'room_3', position: [1.7, 0, 0.9], rotationY: Math.PI / 2 },
  { category: 'chair', roomId: 'room_3', position: [2.7, 0, 0.9], rotationY: -Math.PI / 2 },

  // Entry Lobby (room_1) — sofa along the long wall.
  { category: 'sofa', roomId: 'room_1', position: [1.3, 0, -0.5], rotationY: Math.PI / 2 },
];
