import * as THREE from 'three';

import type { Floorplan } from '../../../../core/floorplan/floorplan.types';
import { disposeObject3D } from '../three-object-disposal';
import { loadPbrTextureSet } from '../texture-cache';

import {
  FOG_COLOR,
  FOG_FAR_M,
  FOG_NEAR_M,
  HEMISPHERE_GROUND_COLOR,
  HEMISPHERE_INTENSITY,
  HEMISPHERE_SKY_COLOR,
  SUN_LIGHT_INTENSITY,
  TERRAIN_ANISOTROPY,
  TERRAIN_TEXTURE_PATH,
  TERRAIN_TEXTURE_TILE_METERS,
} from './environment.constants';
import { createSky, sunDirection } from './sky';
import { buildTerrainMesh, computeEnvironmentBounds, type EnvironmentBounds } from './terrain';
import { buildVegetation, seedFromBounds } from './vegetation';

/**
 * The exterior environment: sky, fog, lighting, terrain, and vegetation — kept as one
 * cohesive subsystem, separate from the house (FloorplanSceneManager) and furniture
 * groups. Sky/fog/lighting are set up once and don't change between floor plans;
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
  private readonly directionalLight: THREE.DirectionalLight;

  private terrainMesh: THREE.Mesh | null = null;
  private vegetationGroup: THREE.Group | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collidables: THREE.Group,
  ) {
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR_M, FOG_FAR_M);

    this.sky = createSky();
    this.scene.add(this.sky);

    const sun = sunDirection();

    this.hemisphereLight = new THREE.HemisphereLight(HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, HEMISPHERE_INTENSITY);
    this.scene.add(this.hemisphereLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, SUN_LIGHT_INTENSITY);
    this.directionalLight.position.copy(sun.clone().multiplyScalar(50));
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.camera.near = 0.01;
    this.directionalLight.shadow.camera.far = 500;
    this.directionalLight.shadow.camera.right = 30;
    this.directionalLight.shadow.camera.left = -30;
    this.directionalLight.shadow.camera.top = 30;
    this.directionalLight.shadow.camera.bottom = -30;
    this.directionalLight.shadow.mapSize.set(1024, 1024);
    this.directionalLight.shadow.radius = 4;
    this.directionalLight.shadow.bias = -0.00006;
    this.scene.add(this.directionalLight);
  }

  /**
   * Recomputes terrain size + vegetation layout for `floorplan` and swaps them in,
   * disposing whatever was there before. The terrain texture is loaded through the
   * shared cache (texture-cache.ts) — free after the very first floor plan load,
   * even across many reloads.
   */
  async rebuild(floorplan: Floorplan, rendererMaxAnisotropy: number): Promise<EnvironmentBounds> {
    const bounds = computeEnvironmentBounds(floorplan);
    const material = await this.buildTerrainMaterial(bounds, rendererMaxAnisotropy);

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
  private async buildTerrainMaterial(bounds: EnvironmentBounds, rendererMaxAnisotropy: number): Promise<THREE.Material> {
    try {
      const textures = await loadPbrTextureSet({
        basePath: TERRAIN_TEXTURE_PATH,
        repeat: [bounds.terrainWidth / TERRAIN_TEXTURE_TILE_METERS, bounds.terrainDepth / TERRAIN_TEXTURE_TILE_METERS],
        anisotropy: Math.min(TERRAIN_ANISOTROPY, rendererMaxAnisotropy || TERRAIN_ANISOTROPY),
      });

      return new THREE.MeshStandardMaterial({
        map: textures.diffuse,
        normalMap: textures.normal,
        roughnessMap: textures.roughness,
        roughness: 1,
      });
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
    this.scene.remove(this.directionalLight);
    this.scene.fog = null;
  }

  private disposeGround(): void {
    if (this.terrainMesh) {
      this.collidables.remove(this.terrainMesh);
      // keepTextures: the leafy_grass texture set is shared via texture-cache.ts and
      // may be reused by the next rebuild() — only this mesh's own geometry/material
      // wrapper is freed here.
      disposeObject3D(this.terrainMesh, { keepTextures: true });
      this.terrainMesh = null;
    }
    if (this.vegetationGroup) {
      this.scene.remove(this.vegetationGroup);
      disposeObject3D(this.vegetationGroup);
      this.vegetationGroup = null;
    }
  }
}
