/**
 * Framework-agnostic representation of a parsed floor plan. Decouples the CubiCasa5K
 * SVG format from Three.js: cubicasa-parser.ts produces this, floorplan-geometry.ts
 * (in features/viewer-3d/engine) is the only place that turns it into meshes.
 */
export type Point2 = [number, number];

export interface FloorplanWall {
  id: string;
  /** Raw 4-point footprint in meters, corners preserved as mitered in the SVG. */
  polygon: Point2[];
  /** Centerline start/end in meters. */
  start: Point2;
  end: Point2;
  /** Wall thickness in meters. */
  thickness: number;
  isExterior: boolean;
}

export interface FloorplanDoor {
  id: string;
  wallId: string;
  /** 0..1 along the wall centerline (start to end). */
  position: number;
  width: number;
  height: number;
}

export interface FloorplanWindow {
  id: string;
  wallId: string;
  /** 0..1 along the wall centerline (start to end). */
  position: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface FloorplanRoom {
  id: string;
  name: string;
  type: string;
  /** Polygon in meters. */
  polygon: Point2[];
}

export interface Floorplan {
  scaleMetersPerUnit: number;
  walls: FloorplanWall[];
  doors: FloorplanDoor[];
  windows: FloorplanWindow[];
  rooms: FloorplanRoom[];
  /** Building outline in meters, used to generate the floor slab. */
  outerPerimeter: Point2[];
}
