import * as THREE from 'three';

import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import { FLOORPLAN_SCALE_METERS_PER_UNIT } from '../../../core/floorplan/floorplan.constants';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';

import { buildFloorplanGroup, createFloorplanMaterials } from './floorplan-geometry';
import { disposeObject3D } from './three-object-disposal';

/**
 * Owns the currently-loaded floor plan's Three.js geometry. Pulled out of
 * Viewer3DEngine so it can be reused for both the initial demo plan and any later
 * user-picked SVG, and so it's testable without a WebGLRenderer (this class only
 * touches plain THREE.Object3D graph operations, no GPU context needed).
 *
 * `parent` is whatever collidable container the engine wants this geometry added to
 * (its Octree gets rebuilt from that same container after house and terrain are in
 * place — see Viewer3DEngine.rebuildCollisions()) — this class does not touch
 * the Octree itself.
 */
export class FloorplanSceneManager {
  private group: THREE.Group | null = null;

  constructor(private readonly parent: THREE.Object3D) {}

  get currentGroup(): THREE.Group | null {
    return this.group;
  }

  /**
   * Parses `svgText` and builds its geometry first; only once that succeeds does it
   * remove/dispose whatever floor plan was previously loaded. This ordering is what
   * keeps an invalid SVG from ever affecting the current scene: on failure, this
   * throws and nothing here has changed yet.
   */
  load(svgText: string): Floorplan {
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: FLOORPLAN_SCALE_METERS_PER_UNIT });
    if (floorplan.walls.length === 0) {
      throw new Error('El plano CubiCasa no contiene muros.');
    }

    const nextGroup = buildFloorplanGroup(floorplan, createFloorplanMaterials());

    if (this.group) {
      this.parent.remove(this.group);
      // Style textures belong to texture-cache.ts and must survive a plan reload.
      disposeObject3D(this.group, { keepTextures: true });
    }

    this.parent.add(nextGroup);
    this.group = nextGroup;

    return floorplan;
  }

  dispose(): void {
    if (!this.group) {
      return;
    }
    this.parent.remove(this.group);
    disposeObject3D(this.group, { keepTextures: true });
    this.group = null;
  }
}
