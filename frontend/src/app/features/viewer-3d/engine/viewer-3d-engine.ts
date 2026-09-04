import * as THREE from 'three';
import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { Octree } from 'three/addons/math/Octree.js';

import type { ConstructionBudgetSummary } from '../../../core/budget/budget.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import { FLOORPLAN_URL } from '../../../core/floorplan/floorplan.constants';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';
import type { WallSurfaceOverride } from '../../../core/materials/material.types';

import { EnvironmentManager } from './environment/environment-manager';
import { FloorplanSceneManager } from './floorplan-scene-manager';
import { InteriorStyleManager } from './interior-style/interior-style-manager';
import { KeyboardMovementInput } from './movement-input';
import { MaterialRegistry } from './materials/material-registry';
import { PlayerController } from './player-controller';
import { PointerLockLookInput } from './pointer-lock-look-input';
import { disposeObject3D } from './three-object-disposal';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  MAX_DELTA_TIME,
  STEPS_PER_FRAME,
} from './viewer-3d.constants';
import type { MovementInputSource, Viewer3DEngineCallbacks } from './viewer-3d.types';

/**
 * Three.js engine for the first-person walkthrough. Loads a CubiCasa floor plan, turns
 * it into real geometry, surrounds it with an exterior environment (terrain/sky/
 * vegetation), lets an interior style retexture its architectural finishes, and feeds every
 * collidable piece into one Octree + PlayerController pipeline.
 *
 * Groups stay separate and independently disposable, matching the scene's conceptual
 * layout: `houseGroup` (FloorplanSceneManager), terrain/vegetation (EnvironmentManager),
 * House and terrain are children of `collidables`, the single container rebuildCollisions() rebuilds the
 * Octree from; sky/lights/vegetation are decorative and live directly under `scene`,
 * never considered for collision.
 */
export class Viewer3DEngine {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly worldOctree = new Octree();
  private readonly collidables = new THREE.Group();
  private readonly floorplanScene: FloorplanSceneManager;
  private readonly environment: EnvironmentManager;
  private readonly interiorStyle: InteriorStyleManager;
  private readonly materialRegistry: MaterialRegistry;
  private readonly resizeObserver: ResizeObserver;

  private readonly movementInput: MovementInputSource;
  private readonly lookInput: PointerLockLookInput;
  private readonly player: PlayerController;

  private currentFloorplan: Floorplan | null = null;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: Viewer3DEngineCallbacks = {},
  ) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, this.containerAspect(), CAMERA_NEAR, CAMERA_FAR);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Sized by the container via ResizeObserver below rather than by the renderer,
    // so the canvas always matches its host element instead of the whole window.
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    // Procedural warm PMREM: gives glass and finished floors a subtle dusk reflection
    // without downloading an HDR panorama.
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const colorEnvironment = new ColorEnvironment(0xd0a486);
    this.scene.environment = pmremGenerator.fromScene(colorEnvironment, 0.04).texture;
    colorEnvironment.dispose();
    pmremGenerator.dispose();

    this.collidables.name = 'collidables';
    this.scene.add(this.collidables);

    this.materialRegistry = new MaterialRegistry(this.renderer.capabilities.getMaxAnisotropy());
    this.floorplanScene = new FloorplanSceneManager(this.collidables);
    this.environment = new EnvironmentManager(this.scene, this.collidables, this.materialRegistry);
    this.interiorStyle = new InteriorStyleManager(this.materialRegistry);

    this.movementInput = new KeyboardMovementInput();
    this.lookInput = new PointerLockLookInput(this.renderer.domElement, this.camera, (locked) =>
      this.callbacks.onPointerLockChange?.(locked),
    );
    this.player = new PlayerController(this.camera, this.worldOctree, this.movementInput);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();

    this.renderer.setAnimationLoop(this.animate);

    this.loadDefaultFloorplan();
  }

  requestPointerLock(): void {
    this.lookInput.requestLock();
  }

  /**
   * Loads a floor plan from raw SVG text — e.g. a user-picked file, already validated
   * by core/floorplan/floorplan-file.ts — replacing whatever is currently shown: house
   * geometry, exterior terrain/vegetation, the currently-selected interior style's
   * materials (re-applied to the new house), collisions, and the
   * player's position all get recomputed for the new plan. Throws (leaving the current
   * scenario fully intact — see FloorplanSceneManager.load) if the SVG doesn't parse
   * into a usable plan.
   */
  async loadFloorplanFromSvgText(svgText: string): Promise<void> {
    const floorplan = this.floorplanScene.load(svgText);
    this.currentFloorplan = floorplan;

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    await this.environment.rebuild(floorplan, maxAnisotropy);
    await this.interiorStyle.applyStyle(
      this.interiorStyle.currentStyle,
      this.floorplanScene.currentGroup,
      maxAnisotropy,
    );

    this.rebuildCollisions();
    this.player.respawn();
  }

  /**
   * Retextures every semantic architectural finish. Never touches house geometry or
   * the player's position.
   */
  async applyInteriorStyle(styleId: InteriorStyleId): Promise<void> {
    await this.interiorStyle.applyStyle(
      styleId,
      this.floorplanScene.currentGroup,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
  }

  /** Applies explicit side-specific accents while preserving the current geometry. */
  async applyWallSurfaceOverrides(overrides: readonly WallSurfaceOverride[]): Promise<void> {
    this.interiorStyle.setWallSurfaceOverrides(overrides);
    await this.applyInteriorStyle(this.interiorStyle.currentStyle);
  }

  get currentInteriorStyle(): InteriorStyleId {
    return this.interiorStyle.currentStyle;
  }

  getBudget(): ConstructionBudgetSummary {
    return this.interiorStyle.getBudget(this.currentFloorplan ?? undefined);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.movementInput.dispose();
    this.lookInput.dispose();
    this.interiorStyle.dispose();
    this.environment.dispose();
    this.floorplanScene.dispose();

    disposeObject3D(this.scene);
    this.scene.environment?.dispose();
    this.materialRegistry.dispose();

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Rebuilds the world Octree from every currently-collidable object (house + terrain). */
  private rebuildCollisions(): void {
    this.worldOctree.clear();
    this.worldOctree.fromGraphNode(this.collidables);
  }

  private async loadDefaultFloorplan(): Promise<void> {
    try {
      const response = await fetch(FLOORPLAN_URL);
      if (!response.ok) {
        throw new Error('No se pudo cargar el plano CubiCasa.');
      }

      const svgText = await response.text();
      await this.loadFloorplanFromSvgText(svgText);

      this.callbacks.onReady?.();
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }

  private readonly animate = (): void => {
    const deltaTime = Math.min(MAX_DELTA_TIME, this.clock.getDelta()) / STEPS_PER_FRAME;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      this.player.update(deltaTime);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private handleResize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private containerAspect(): number {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    return width / height;
  }
}
