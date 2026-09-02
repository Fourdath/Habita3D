import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import { FLOORPLAN_SCALE_METERS_PER_UNIT, FLOORPLAN_URL } from '../../../core/floorplan/floorplan.constants';

import { buildFloorplanGroup, createFloorplanMaterials } from './floorplan-geometry';
import { KeyboardMovementInput } from './movement-input';
import { PlayerController } from './player-controller';
import { PointerLockLookInput } from './pointer-lock-look-input';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, MAX_DELTA_TIME, STEPS_PER_FRAME } from './viewer-3d.constants';
import type { MovementInputSource, Viewer3DEngineCallbacks } from './viewer-3d.types';

/**
 * Three.js engine for the first-person walkthrough. Loads the CubiCasa floor plan,
 * turns it into real geometry (walls with door/window openings, floor), and feeds
 * that geometry into the same Octree + PlayerController collision pipeline used by
 * the viewer since its first technical test.
 */
export class Viewer3DEngine {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly worldOctree = new Octree();
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

    this.movementInput = new KeyboardMovementInput();
    this.lookInput = new PointerLockLookInput(this.renderer.domElement, this.camera, (locked) =>
      this.callbacks.onPointerLockChange?.(locked),
    );
    this.player = new PlayerController(this.camera, this.worldOctree, this.movementInput);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();

    this.renderer.setAnimationLoop(this.animate);

    this.loadScenario();
  }

  requestPointerLock(): void {
    this.lookInput.requestLock();
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

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        this.disposeMaterial(object.material);
      }
    });

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

  /**
   * Fetches the CubiCasa SVG, parses it into a Floorplan, builds its Three.js
   * geometry (walls with real door/window openings, floor), adds it to the scene,
   * and builds the world Octree from that same geometry so collisions match exactly
   * what's rendered — no separate collision mesh to keep in sync.
   */
  private async loadScenario(): Promise<void> {
    try {
      const response = await fetch(FLOORPLAN_URL);
      if (!response.ok) {
        throw new Error('No se pudo cargar el plano CubiCasa.');
      }

      const svgText = await response.text();
      const floorplan = parseFloorplan(svgText, { scaleMetersPerUnit: FLOORPLAN_SCALE_METERS_PER_UNIT });
      if (floorplan.walls.length === 0) {
        throw new Error('El plano CubiCasa no contiene muros.');
      }

      const floorplanGroup = buildFloorplanGroup(floorplan, createFloorplanMaterials());
      this.scene.add(floorplanGroup);
      this.worldOctree.fromGraphNode(floorplanGroup);

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

  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    const materials = Array.isArray(material) ? material : [material];
    for (const mat of materials) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
      mat.dispose();
    }
  }
}
