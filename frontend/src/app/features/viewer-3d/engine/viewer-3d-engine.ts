import * as THREE from 'three';
import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { Octree } from 'three/addons/math/Octree.js';

import { computeFloorAreaM2, type BudgetSummary } from '../../../core/interior-style/budget-calculator';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import { FLOORPLAN_URL } from '../../../core/floorplan/floorplan.constants';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';

import { EnvironmentManager } from './environment/environment-manager';
import { FloorplanSceneManager } from './floorplan-scene-manager';
import { InteriorStyleManager } from './interior-style/interior-style-manager';
import { KeyboardMovementInput } from './movement-input';
import { PlayerController } from './player-controller';
import { PointerLockLookInput } from './pointer-lock-look-input';
import { disposeObject3D } from './three-object-disposal';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, MAX_DELTA_TIME, STEPS_PER_FRAME } from './viewer-3d.constants';
import type { MovementInputSource, Viewer3DEngineCallbacks } from './viewer-3d.types';

/**
 * Three.js engine for the first-person walkthrough. Loads a CubiCasa floor plan, turns
 * it into real geometry, surrounds it with an exterior environment (terrain/sky/
 * vegetation), lets an interior style retexture it and furnish it, and feeds every
 * collidable piece into one Octree + PlayerController pipeline.
 *
 * Groups stay separate and independently disposable, matching the scene's conceptual
 * layout: `houseGroup` (FloorplanSceneManager), terrain/vegetation (EnvironmentManager),
 * and `furniture` (InteriorStyleManager). House, terrain, and furniture are all
 * children of `collidables`, the single container rebuildCollisions() rebuilds the
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
  private readonly resizeObserver: ResizeObserver;

  private readonly movementInput: MovementInputSource;
  private readonly lookInput: PointerLockLookInput;
  private readonly player: PlayerController;

  private currentFloorplan: Floorplan | null = null;
  private isDefaultFloorplan = false;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: Viewer3DEngineCallbacks = {},
  ) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, this.containerAspect(), CAMERA_NEAR, CAMERA_FAR);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Sized by the container via ResizeObserver below rather than by the renderer,
    // so the canvas always matches its host element instead of the whole window.
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    // Some furniture GLBs use near-metallic PBR materials. Without any environment to
    // reflect, a metal has essentially nothing to show (real metals have ~zero diffuse
    // albedo) and renders solid black — confirmed visually. A uniform-color PMREM
    // environment (procedural, no HDRI file, tiny sphere) gives PBR materials
    // something plausible to reflect, at negligible cost.
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const colorEnvironment = new ColorEnvironment(0x9fb8c8);
    this.scene.environment = pmremGenerator.fromScene(colorEnvironment, 0.04).texture;
    colorEnvironment.dispose();
    pmremGenerator.dispose();

    this.collidables.name = 'collidables';
    this.scene.add(this.collidables);

    this.floorplanScene = new FloorplanSceneManager(this.collidables);
    this.environment = new EnvironmentManager(this.scene, this.collidables);
    this.interiorStyle = new InteriorStyleManager(this.collidables);

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
   * materials (re-applied to the new house — furniture is not, see
   * InteriorStyleManager.applyStyle's isDefaultFloorplan param), collisions, and the
   * player's position all get recomputed for the new plan. Throws (leaving the current
   * scenario fully intact — see FloorplanSceneManager.load) if the SVG doesn't parse
   * into a usable plan.
   */
  async loadFloorplanFromSvgText(svgText: string, options: { isDefault?: boolean } = {}): Promise<void> {
    const floorplan = this.floorplanScene.load(svgText);
    this.currentFloorplan = floorplan;
    this.isDefaultFloorplan = options.isDefault ?? false;

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    await this.environment.rebuild(floorplan, maxAnisotropy);
    await this.interiorStyle.applyStyle(
      this.interiorStyle.currentStyle,
      this.floorplanScene.currentGroup,
      this.isDefaultFloorplan,
      maxAnisotropy,
    );

    this.rebuildCollisions();
    this.player.respawn();
  }

  /**
   * Retextures the house (wall/floor materials) and, only for the bundled default
   * plan, rebuilds the furniture layout for `styleId`. Never touches house geometry
   * or the player's position — only materials/furniture and, consequently, collisions.
   */
  async applyInteriorStyle(styleId: InteriorStyleId): Promise<void> {
    await this.interiorStyle.applyStyle(
      styleId,
      this.floorplanScene.currentGroup,
      this.isDefaultFloorplan,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.rebuildCollisions();
  }

  get currentInteriorStyle(): InteriorStyleId {
    return this.interiorStyle.currentStyle;
  }

  get isCurrentFloorplanDefault(): boolean {
    return this.isDefaultFloorplan;
  }

  get hasFurnitureLayout(): boolean {
    return this.interiorStyle.hasFurniture;
  }

  getBudget(): BudgetSummary {
    const floorAreaM2 = this.currentFloorplan ? computeFloorAreaM2(this.currentFloorplan.rooms.map((room) => room.polygon)) : undefined;
    return this.interiorStyle.getBudget(floorAreaM2);
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

    disposeObject3D(this.scene);
    this.scene.environment?.dispose();

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Rebuilds the world Octree from every currently-collidable object (house + terrain + furniture). */
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
      await this.loadFloorplanFromSvgText(svgText, { isDefault: true });

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
