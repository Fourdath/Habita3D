import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import { FLOORPLAN_SCALE_METERS_PER_UNIT } from '../../../core/floorplan/floorplan.constants';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';

import { buildFloorplanGroup, createFloorplanMaterials } from './floorplan-geometry';
import { disposeObject3D } from './three-object-disposal';

/**
 * Owns the currently-loaded floor plan's Three.js geometry and its entry in the world
 * Octree. Pulled out of Viewer3DEngine so it can be reused for both the initial demo
 * plan and any later user-picked SVG, and so it's testable without a WebGLRenderer
 * (this class only touches THREE.Scene/Octree, neither of which needs a GPU context).
 */
export class FloorplanSceneManager {
  private group: THREE.Group | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldOctree: Octree,
  ) {}

  get currentGroup(): THREE.Group | null {
    return this.group;
  }

  /**
   * Parses `svgText` and builds its geometry first; only once that succeeds does it
   * remove/dispose whatever floor plan was previously loaded and rebuild the Octree.
   * This ordering is what keeps an invalid SVG from ever affecting the current scene:
   * on failure, this throws and nothing here has changed yet.
   */
  load(svgText: string): Floorplan {
    const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: FLOORPLAN_SCALE_METERS_PER_UNIT });
    if (floorplan.walls.length === 0) {
      throw new Error('El plano CubiCasa no contiene muros.');
    }

    const nextGroup = buildFloorplanGroup(floorplan, createFloorplanMaterials());

    if (this.group) {
      this.scene.remove(this.group);
      disposeObject3D(this.group);
    }

    this.scene.add(nextGroup);
    this.group = nextGroup;

    this.worldOctree.clear();
    this.worldOctree.fromGraphNode(nextGroup);

    return floorplan;
  }

  dispose(): void {
    if (!this.group) {
      return;
    }
    this.scene.remove(this.group);
    disposeObject3D(this.group);
    this.group = null;
  }
}
