import * as THREE from 'three';

import type { Floorplan } from '../../../../core/floorplan/floorplan.types';
import { disposeObject3D } from '../three-object-disposal';
import { MaterialRegistry } from '../materials/material-registry';

import {
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  FOG_COLOR,
  FOG_FAR_M,
  FOG_NEAR_M,
  HEMISPHERE_GROUND_COLOR,
  HEMISPHERE_INTENSITY,
  HEMISPHERE_SKY_COLOR,
  SUN_LIGHT_INTENSITY,
  SUN_LIGHT_COLOR,
} from './environment.constants';
import { createSky, sunDirection } from './sky';
import { buildTerrainMesh, computeEnvironmentBounds, type EnvironmentBounds } from './terrain';
import { buildVegetation, seedFromBounds } from './vegetation';

/**
 * The exterior environment: sky, fog, lighting, terrain, and vegetation — kept as one
 * cohesive subsystem, separate from the house (FloorplanSceneManager). Sky/fog and
 * lighting are set up once and don't change between floor plans;
 * terrain/vegetation depend on the current plan's footprint and are rebuilt whenever
 * a plan is (re)loaded via rebuild().
 *
 * Terrain is added to `collidables` (so it's included in the world Octree); sky,
 * lights, and vegetation are added directly to `scene` — decorative/atmospheric,
 * never considered for collision.
 */
export class EnvironmentManager {
  private readonly sky: THREE.Object3D;
  private readonly hemisphereLight: THREE.HemisphereLight;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly directionalLight: THREE.DirectionalLight;

  private terrainMesh: THREE.Mesh | null = null;
  private vegetationGroup: THREE.Group | null = null;
  private readonly registry: MaterialRegistry;
  private readonly ownsRegistry: boolean;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collidables: THREE.Group,
    registry?: MaterialRegistry,
  ) {
    this.registry = registry ?? new MaterialRegistry();
    this.ownsRegistry = !registry;
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR_M, FOG_FAR_M);

    this.sky = createSky();
    this.scene.add(this.sky);

    const sun = sunDirection();

    this.hemisphereLight = new THREE.HemisphereLight(HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, HEMISPHERE_INTENSITY);
    this.scene.add(this.hemisphereLight);

    this.ambientLight = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(SUN_LIGHT_COLOR, SUN_LIGHT_INTENSITY);
    this.directionalLight.position.copy(sun.clone().multiplyScalar(50));
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.camera.near = 0.01;
    this.directionalLight.shadow.camera.far = 120;
    this.directionalLight.shadow.camera.right = 30;
    this.directionalLight.shadow.camera.left = -30;
    this.directionalLight.shadow.camera.top = 30;
    this.directionalLight.shadow.camera.bottom = -30;
    this.directionalLight.shadow.mapSize.set(1024, 1024);
    this.directionalLight.shadow.radius = 4;
    this.directionalLight.shadow.bias = -0.00006;
    this.scene.add(this.directionalLight, this.directionalLight.target);
  }

  /**
   * Recomputes terrain size + vegetation layout for `floorplan` and swaps them in,
   * disposing whatever was there before. The terrain texture is owned and reused by
   * the engine-level MaterialRegistry across floor-plan reloads.
   */
  async rebuild(floorplan: Floorplan, rendererMaxAnisotropy: number): Promise<EnvironmentBounds> {
    const bounds = computeEnvironmentBounds(floorplan);
    const material = await this.buildTerrainMaterial(rendererMaxAnisotropy);

    this.directionalLight.position
      .set(bounds.centerX, 0, bounds.centerZ)
      .add(sunDirection().multiplyScalar(50));
    this.directionalLight.target.position.set(bounds.centerX, 0, bounds.centerZ);
    this.directionalLight.target.updateMatrixWorld();

    this.disposeGround();

    this.terrainMesh = buildTerrainMesh(bounds, material);
    this.collidables.add(this.terrainMesh);

    this.vegetationGroup = buildVegetation(bounds, seedFromBounds(bounds));
    this.scene.add(this.vegetationGroup);

    return bounds;
  }

  /**
   * Never rejects: a failed texture load (network hiccup, missing file) falls back to
   * a flat-colored material rather than aborting the whole floor-plan load — terrain
   * still gets the right size/collision for the new plan, it just isn't textured.
   */
  private async buildTerrainMaterial(_rendererMaxAnisotropy: number): Promise<THREE.Material> {
    try {
      return await this.registry.get('TERRAIN_GRASS');
    } catch (error) {
      console.error('No se pudo cargar la textura del terreno; se usa un color plano de respaldo.', error);
      return new THREE.MeshStandardMaterial({ color: 0x6b8f4e, roughness: 1 });
    }
  }

  dispose(): void {
    this.disposeGround();

    this.scene.remove(this.sky);
    disposeObject3D(this.sky);

    this.scene.remove(this.hemisphereLight);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.directionalLight);
    this.scene.remove(this.directionalLight.target);
    this.scene.fog = null;
    if (this.ownsRegistry) this.registry.dispose();
  }

  private disposeGround(): void {
    if (this.terrainMesh) {
      this.collidables.remove(this.terrainMesh);
      // The shared registry owns this material; a terrain rebuild only owns geometry.
      disposeObject3D(this.terrainMesh, { keepMaterials: true });
      this.terrainMesh = null;
    }
    if (this.vegetationGroup) {
      this.scene.remove(this.vegetationGroup);
      disposeObject3D(this.vegetationGroup);
      this.vegetationGroup = null;
    }
  }
}
