/**
 * Geometry for the home hero illustration: a 10 × 7 m single-storey house
 * (living-kitchen, bedroom, bathroom) described in metres. It is a static
 * illustration rendered with CSS 3D transforms — not a CubiCasa plan and not
 * produced by the Three.js engine.
 */

export interface ModelWall {
  x: number;
  y: number;
  length: number;
  axis: 'h' | 'v';
  window?: boolean;
}

export interface ModelRoom {
  x: number;
  y: number;
  width: number;
  depth: number;
  finish: 'oak' | 'laminate' | 'tile';
  label: string;
  area: string;
  labelX: number;
  labelY: number;
}

export type ModelTone = 'counter' | 'white' | 'wood' | 'fabric' | 'dark' | 'bed' | 'stone';

export interface ModelBox {
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  tone: ModelTone;
}

export const MODEL_ROOMS: readonly ModelRoom[] = [
  { x: 0, y: 0, width: 6, depth: 7, finish: 'oak', label: 'ESTAR · COCINA', area: '42,0 m²', labelX: 3.2, labelY: 3.75 },
  { x: 6, y: 0, width: 4, depth: 4.6, finish: 'laminate', label: 'DORMITORIO', area: '18,4 m²', labelX: 7.6, labelY: 3.05 },
  { x: 6, y: 4.6, width: 4, depth: 2.4, finish: 'tile', label: 'BAÑO', area: '9,6 m²', labelX: 7.45, labelY: 6.2 },
];

/** Wall segments; gaps between segments are door openings. */
export const MODEL_WALLS: readonly ModelWall[] = [
  // North façade (y = 0)
  { x: 0, y: 0, length: 1.2, axis: 'h' },
  { x: 1.2, y: 0, length: 2.2, axis: 'h', window: true },
  { x: 3.4, y: 0, length: 5, axis: 'h' },
  { x: 8.4, y: 0, length: 1.2, axis: 'h', window: true },
  { x: 9.6, y: 0, length: 0.4, axis: 'h' },
  // West façade (x = 0)
  { x: 0, y: 0, length: 2, axis: 'v' },
  { x: 0, y: 2, length: 2.6, axis: 'v', window: true },
  { x: 0, y: 4.6, length: 2.4, axis: 'v' },
  // East façade (x = 10)
  { x: 10, y: 0, length: 1, axis: 'v' },
  { x: 10, y: 1, length: 2.2, axis: 'v', window: true },
  { x: 10, y: 3.2, length: 3.8, axis: 'v' },
  // Interior partitions
  { x: 6, y: 0, length: 3.4, axis: 'v' },
  { x: 6, y: 4.3, length: 0.9, axis: 'v' },
  { x: 6, y: 6, length: 1, axis: 'v' },
  { x: 6, y: 4.6, length: 4, axis: 'h' },
  // South façade (y = 7) — entrance between 1.4 and 2.4
  { x: 0, y: 7, length: 1.4, axis: 'h' },
  { x: 2.4, y: 7, length: 0.8, axis: 'h' },
  { x: 3.2, y: 7, length: 2, axis: 'h', window: true },
  { x: 5.2, y: 7, length: 2.4, axis: 'h' },
  { x: 7.6, y: 7, length: 1.2, axis: 'h', window: true },
  { x: 8.8, y: 7, length: 1.2, axis: 'h' },
];

/** Door leaves and swings, in plan metres (SVG path data). */
export const MODEL_DOOR_SWINGS: readonly string[] = [
  'M1.4 7 L1.4 6 A1 1 0 0 1 2.4 7',
  'M6 3.4 L6.9 3.4 A0.9 0.9 0 0 1 6 4.3',
  'M6 6 L6.8 6 A0.8 0.8 0 0 0 6 5.2',
];

export const MODEL_RUG = { x: 1.3, y: 4.7, width: 2.2, depth: 1.6 };

export const MODEL_FURNITURE: readonly ModelBox[] = [
  // Living-kitchen
  { x: 0.15, y: 0.15, width: 2.7, depth: 0.6, height: 0.9, tone: 'counter' },
  { x: 2.95, y: 0.15, width: 0.7, depth: 0.65, height: 1.35, tone: 'white' },
  { x: 3.5, y: 1.2, width: 0.42, depth: 0.42, height: 0.45, tone: 'dark' },
  { x: 4.28, y: 1.2, width: 0.42, depth: 0.42, height: 0.45, tone: 'dark' },
  { x: 3.4, y: 1.7, width: 1.4, depth: 0.9, height: 0.75, tone: 'wood' },
  { x: 3.5, y: 2.68, width: 0.42, depth: 0.42, height: 0.45, tone: 'dark' },
  { x: 4.28, y: 2.68, width: 0.42, depth: 0.42, height: 0.45, tone: 'dark' },
  { x: 0.15, y: 4.8, width: 0.25, depth: 2.1, height: 0.85, tone: 'fabric' },
  { x: 0.4, y: 4.8, width: 0.75, depth: 2.1, height: 0.45, tone: 'fabric' },
  { x: 1.75, y: 5.0, width: 0.6, depth: 1.05, height: 0.4, tone: 'wood' },
  // Bedroom
  { x: 6.6, y: 0.15, width: 1.6, depth: 0.12, height: 0.9, tone: 'wood' },
  { x: 6.6, y: 0.27, width: 1.6, depth: 1.95, height: 0.5, tone: 'bed' },
  { x: 8.3, y: 0.2, width: 0.45, depth: 0.4, height: 0.5, tone: 'wood' },
  { x: 9.35, y: 3.3, width: 0.6, depth: 1.2, height: 1.35, tone: 'white' },
  // Bathroom
  { x: 6.2, y: 4.75, width: 1, depth: 0.5, height: 0.85, tone: 'white' },
  { x: 7.6, y: 4.75, width: 0.42, depth: 0.62, height: 0.42, tone: 'white' },
  { x: 8.65, y: 5.65, width: 1.2, depth: 1.2, height: 0.06, tone: 'stone' },
  // Entrance step (outside)
  { x: 1, y: 7.1, width: 1.8, depth: 0.8, height: 0.08, tone: 'stone' },
];
