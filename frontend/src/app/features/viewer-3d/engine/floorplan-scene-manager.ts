import * as THREE from 'three';
import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import { buildFloorplanGroup } from './floorplan-geometry';
import { MaterialRegistry } from './materials/material-registry';
import type { FloorplanBuildResult } from './surface-mesh.types';
import { disposeObject3D } from './three-object-disposal';

/** Commits a complete build; failed or superseded loads keep the current scene. */
export class FloorplanSceneManager {
  private result: FloorplanBuildResult | null = null;
  private requestToken = 0;
  private disposed = false;
  private readonly registry: MaterialRegistry;
  private readonly ownsRegistry: boolean;

  constructor(private readonly parent: THREE.Object3D, registry?: MaterialRegistry) {
    this.registry = registry ?? new MaterialRegistry();
    this.ownsRegistry = !registry;
  }

  get currentGroup(): THREE.Group | null { return this.result?.group ?? null; }
  get currentManifest() { return this.result?.manifest; }

  async load(svgText: string, styleId: InteriorStyleId = 'none'): Promise<Floorplan | null> {
    if (this.disposed) return null;
    const token = ++this.requestToken;
    const floorplan = parseFloorplan(svgText);
    if (floorplan.walls.length === 0) throw new Error('El plano CubiCasa no contiene muros.');
    const next = await buildFloorplanGroup(floorplan, this.registry, styleId);
    if (this.disposed || token !== this.requestToken) {
      disposeObject3D(next.group, { keepMaterials: true });
      return null;
    }
    if (this.result) {
      this.parent.remove(this.result.group);
      disposeObject3D(this.result.group, { keepMaterials: true });
    }
    this.parent.add(next.group);
    this.result = next;
    floorplan.wallConstructions = next.constructions;
    floorplan.kitchenRuns = next.kitchenRuns;
    return floorplan;
  }

  dispose(): void {
    this.disposed = true;
    ++this.requestToken;
    if (this.result) {
      this.parent.remove(this.result.group);
      disposeObject3D(this.result.group, { keepMaterials: true });
      this.result = null;
    }
    if (this.ownsRegistry) this.registry.dispose();
  }
}
