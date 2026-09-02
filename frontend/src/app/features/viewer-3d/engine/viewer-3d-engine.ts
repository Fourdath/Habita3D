import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

import { FLOORPLAN_URL } from '../../../core/floorplan/floorplan.constants';

import { FloorplanSceneManager } from './floorplan-scene-manager';
import { KeyboardMovementInput } from './movement-input';
import { PlayerController } from './player-controller';
import { PointerLockLookInput } from './pointer-lock-look-input';
import { disposeObject3D } from './three-object-disposal';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, MAX_DELTA_TIME, STEPS_PER_FRAME } from './viewer-3d.constants';
import type { MovementInputSource, Viewer3DEngineCallbacks } from './viewer-3d.types';

/**
 * Three.js engine for the first-person walkthrough. Loads a CubiCasa floor plan,
 * turns it into real geometry (walls with door/window openings, floor), and feeds
 * that geometry into the same Octree + PlayerController collision pipeline used by
 * the viewer since its first technical test. Floor-plan lifecycle (load/replace/
 * dispose) lives in FloorplanSceneManager so a new plan — the default one on start,
 * or a user-picked SVG later — is loaded the same way either time.
 */
export class Viewer3DEngine {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly worldOctree = new Octree();
  private readonly floorplanScene: FloorplanSceneManager;
  private readonly resizeObserver: ResizeObserver;

  private readonly movementInput: MovementInputSource;
  private readonly lookInput: PointerLockLookInput;
  private readonly player: PlayerController;

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

    this.setupScene();
    this.floorplanScene = new FloorplanSceneManager(this.scene, this.worldOctree);

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
   * Loads a floor plan from raw SVG text — e.g. a user-picked file, already
   * validated by core/floorplan/floorplan-file.ts — replacing whatever is currently
   * shown. Throws (leaving the current scenario fully intact, see
   * FloorplanSceneManager.load) if the SVG doesn't parse into a usable plan.
   */
  loadFloorplanFromSvgText(svgText: string): void {
    this.floorplanScene.load(svgText);
    this.player.respawn();
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

    disposeObject3D(this.scene);

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x88ccee);
    this.scene.fog = new THREE.Fog(0x88ccee, 0, 50);

    const hemisphereLight = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
    hemisphereLight.position.set(2, 1, 1);
    this.scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(-5, 25, -1);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.01;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    directionalLight.shadow.mapSize.set(1024, 1024);
    directionalLight.shadow.radius = 4;
    directionalLight.shadow.bias = -0.00006;
    this.scene.add(directionalLight);
  }

  private async loadDefaultFloorplan(): Promise<void> {
    try {
      const response = await fetch(FLOORPLAN_URL);
      if (!response.ok) {
        throw new Error('No se pudo cargar el plano CubiCasa.');
      }

      const svgText = await response.text();
      this.loadFloorplanFromSvgText(svgText);

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
