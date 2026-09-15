import type { Point2 } from './floorplan.types';

export type FixtureType =
  | 'TOILET'
  | 'SHOWER'
  | 'BATHTUB'
  | 'SHOWER_SCREEN'
  | 'BATHROOM_SINK'
  | 'KITCHEN_SINK'
  | 'DOUBLE_KITCHEN_SINK'
  | 'UNKNOWN_SINK'
  | 'BASE_CABINET'
  | 'WALL_CABINET'
  | 'STOVE'
  | 'REFRIGERATOR'
  | 'WASHING_MACHINE'
  | 'APPLIANCE_SPACE'
  | 'UNKNOWN';

export interface FloorplanFixture {
  id: string;
  type: FixtureType;
  sourceClasses: string[];
  /** Footprint in recentered metres after SVG transforms and fixture dimension normalization. */
  footprint: Point2[];
  position: Point2;
  /** Forward angle in plan coordinates, radians. */
  rotation: number;
  forwardDirection?: Point2;
  width: number;
  depth: number;
  height?: number;
  elevation?: number;
  roomId?: string;
  groupId?: string;
}

export interface KitchenRun {
  id: string;
  roomId: string;
  wallId?: string;
  fixtureIds: string[];
  start: Point2;
  end: Point2;
  wallSide?: 'A' | 'B';
  /** Meters along the wall centerline: the backsplash covers this span only. */
  startM?: number;
  endM?: number;
}
