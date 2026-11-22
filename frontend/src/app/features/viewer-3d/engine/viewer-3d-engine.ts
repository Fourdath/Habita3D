import * as THREE from 'three';
import { ColorEnvironment } from 'three/addons/environments/ColorEnvironment.js';
import { Octree } from 'three/addons/math/Octree.js';

import type { ConstructionBudgetSummary } from '../../../core/budget/budget.types';
import type { InteriorStyleId } from '../../../core/interior-style/interior-style.types';
import { FLOORPLAN_URL } from '../../../core/floorplan/floorplan.constants';
import type { Floorplan } from '../../../core/floorplan/floorplan.types';
import { resolveFloorplanSpawn } from '../../../core/floorplan/floorplan-spawn';
import { polygonArea } from '../../../core/floorplan/geometry-utils';
import type { WallSurfaceOverride } from '../../../core/materials/material.types';

import { ConstructionBoardView } from './construction-board-view';
import { EnvironmentManager } from './environment/environment-manager';
import { FloorplanSceneManager } from './floorplan-scene-manager';
import { InteriorStyleManager } from './interior-style/interior-style-manager';
import { InteriorWallColorPreview } from './interior-wall-colors';
import { KeyboardMovementInput } from './movement-input';
import { MaterialRegistry } from './materials/material-registry';
import { PlayerController } from './player-controller';
import { PointerLockLookInput } from './pointer-lock-look-input';
import { TouchWalkInput, type WalkDirection } from './touch-walk-input';
import { OverviewController } from './overview-controller';
import { applyRoomFloorSelections, type RoomFloorSelection } from './room-floor-selection';
import { pickVisibleRoom, RoomPicker } from './room-picker';
import { RoomSelectionHighlight } from './room-selection-highlight';
import type { SceneRoom } from '../../../core/ep2/ep2.types';
import { disposeObject3D } from './three-object-disposal';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  MAX_DELTA_TIME,
  STEPS_PER_FRAME,
  PLAYER_CAPSULE_RADIUS,
} from './viewer-3d.constants';
import type { InteriorWallColors, MovementInputSource, Viewer3DEngineCallbacks } from './viewer-3d.types';

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
  private readonly touchInput: TouchWalkInput;
  private readonly player: PlayerController;
  private readonly overview: OverviewController;
  private readonly roomPicker: RoomPicker;
  private readonly roomHighlight = new RoomSelectionHighlight(this.scene);
  private readonly wallColorPreview = new InteriorWallColorPreview();
  private readonly constructionBoardView = new ConstructionBoardView();
  private selectedSceneRoom: string | null = null;
  private interiorWallColors: InteriorWallColors = { all: null, rooms: new Map() };
  private constructionView = false;
  private surfaceUpdate = 0;
  private surfaceUpdating = false;
  private viewMode: 'walk' | 'overview' = 'overview';
  private readonly overviewGrid = new THREE.GridHelper(200, 200, 0xc8cec5, 0xe0e4dd);
  private exteriorFog: THREE.Fog | THREE.FogExp2 | null = null;

  private currentFloorplan: Floorplan | null = null;
  private disposed = false;
  private roomFloorSelections: readonly RoomFloorSelection[] = [];
  private roomFloorRequest = 0;
  private exampleSvg: Promise<string> | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: Viewer3DEngineCallbacks = {},
    loadExample = true,
  ) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, this.containerAspect(), CAMERA_NEAR, CAMERA_FAR);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    this.floorplanScene = new FloorplanSceneManager(this.collidables, this.materialRegistry);
    this.environment = new EnvironmentManager(this.scene, this.collidables, this.materialRegistry);
    this.interiorStyle = new InteriorStyleManager(this.materialRegistry);

    this.movementInput = new KeyboardMovementInput();
    this.lookInput = new PointerLockLookInput(this.renderer.domElement, this.camera,
      (locked) => this.callbacks.onPointerLockChange?.(locked),
      () => this.callbacks.onPointerLockError?.(),
    );
    this.touchInput = new TouchWalkInput(this.renderer.domElement, this.camera);
    this.player = new PlayerController(this.camera, this.worldOctree, {
      getState: () => this.touchInput.enabled ? this.touchInput.getState() : this.movementInput.getState(),
    });
    this.overview = new OverviewController(this.renderer.domElement);
    this.roomPicker = new RoomPicker(this.renderer.domElement, (x, y) => {
      if (this.viewMode !== 'overview' || this.surfaceUpdating) return;
      const roomId = pickVisibleRoom(this.floorplanScene.currentGroup, this.overview.camera, this.renderer.domElement.getBoundingClientRect(), x, y);
      if (roomId) this.callbacks.onRoomPick?.(roomId);
    });
    this.exteriorFog = this.scene.fog;
    this.overviewGrid.position.y = -0.06;
    this.scene.add(this.overviewGrid);
    this.setViewMode('overview');

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();

    this.renderer.setAnimationLoop(this.animate);

    void this.initialize(loadExample);
  }

  requestPointerLock(): void {
    if (this.viewMode === 'walk') this.lookInput.requestLock();
  }

  setTouchWalkEnabled(enabled: boolean): void {
    this.touchInput.setEnabled(enabled && this.viewMode === 'walk');
  }

  setTouchDirection(direction: WalkDirection, pressed: boolean): void {
    this.touchInput.setDirection(direction, pressed);
  }

  setViewMode(mode: 'walk' | 'overview'): void {
    if (this.disposed) return;
    this.viewMode = mode;
    if (mode === 'overview') this.touchInput.setEnabled(false);
    if (mode === 'overview' && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.overview.setEnabled(mode === 'overview');
    this.roomPicker.setEnabled(mode === 'overview');
    this.environment.setOverviewMode(mode === 'overview');
    this.overviewGrid.visible = mode === 'overview';
    this.scene.background = mode === 'overview' ? new THREE.Color(0xf5f6f2) : null;
    this.scene.fog = mode === 'overview' ? new THREE.Fog(0xf5f6f2, 35, 110) : this.exteriorFog;
    this.updateRoomHighlight();
    this.updateConstructionView();
  }

  setSelectedSceneRoom(sceneRoomId: string | null): void {
    if (this.disposed || this.selectedSceneRoom === sceneRoomId) return;
    this.selectedSceneRoom = sceneRoomId;
    this.updateRoomHighlight();
  }

  setInteriorWallColors(colors: InteriorWallColors): void {
    if (this.disposed) return;
    this.interiorWallColors = { all: colors.all, rooms: new Map(colors.rooms) };
    this.wallColorPreview.apply(this.floorplanScene.currentGroup, this.interiorWallColors);
  }

  setConstructionView(enabled: boolean): void {
    if (this.disposed || this.constructionView === enabled) return;
    this.constructionView = enabled;
    if (enabled && this.viewMode === 'overview') this.frameOverview();
    this.updateConstructionView();
  }

  frameOverview(top = false): void {
    this.overview.frame(top);
  }

  zoomOverview(factor: number): void {
    this.overview.zoom(factor);
  }

  getModelSummary(): { roomCount: number; areaM2: number } {
    return {
      roomCount: this.currentFloorplan?.rooms.length ?? 0,
      areaM2: this.currentFloorplan?.rooms.reduce((sum, room) => sum + Math.abs(polygonArea(room.polygon)), 0) ?? 0,
    };
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
    if (this.disposed) return;
    await this.updateSurfaces(() => this.replaceFloorplan(svgText));
  }

  private async replaceFloorplan(svgText: string): Promise<void> {
    const floorplan = await this.floorplanScene.load(svgText, this.interiorStyle.currentStyle);
    if (!floorplan || this.disposed) return;
    this.currentFloorplan = floorplan;

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    await this.environment.rebuild(floorplan, maxAnisotropy);
    if (this.disposed || this.currentFloorplan !== floorplan) return;
    await this.interiorStyle.applyStyle(
      this.interiorStyle.currentStyle,
      this.floorplanScene.currentGroup,
      maxAnisotropy,
    );

    if (this.disposed || this.currentFloorplan !== floorplan) return;
    this.rebuildCollisions();
    this.player.respawn(resolveFloorplanSpawn(floorplan, PLAYER_CAPSULE_RADIUS));
    this.overview.setHouse(this.floorplanScene.currentGroup);
    await this.applyRoomFloors();
  }

  /**
   * Retextures every semantic architectural finish. Never touches house geometry or
   * the player's position.
   */
  async applyInteriorStyle(styleId: InteriorStyleId): Promise<void> {
    if (this.disposed) return;
    await this.updateSurfaces(async () => {
      await this.interiorStyle.applyStyle(
        styleId,
        this.floorplanScene.currentGroup,
        this.renderer.capabilities.getMaxAnisotropy(),
      );
      await this.applyRoomFloors();
    });
  }

  getSceneRooms(): SceneRoom[] {
    return this.currentFloorplan?.rooms.map(room => ({ id: room.id, name: room.name || room.id, areaM2: polygonArea(room.polygon) })) ?? [];
  }

  async setRoomFloorSelections(selections: readonly RoomFloorSelection[]): Promise<void> {
    this.roomFloorSelections = [...selections];
    await this.applyRoomFloors();
  }

  private async applyRoomFloors(): Promise<void> {
    const request = ++this.roomFloorRequest;
    const house = this.floorplanScene.currentGroup;
    await applyRoomFloorSelections(house, this.roomFloorSelections, this.interiorStyle.currentStyle, this.materialRegistry,
      () => !this.disposed && request === this.roomFloorRequest && house === this.floorplanScene.currentGroup);
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
    return this.interiorStyle.getBudget(this.floorplanScene.currentManifest);
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
    this.touchInput.dispose();
    this.roomPicker.dispose();
    this.roomHighlight.dispose();
    this.wallColorPreview.dispose();
    this.constructionBoardView.dispose();
    this.overview.dispose();
    this.overviewGrid.dispose();
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

  private async updateSurfaces(update: () => Promise<void>): Promise<void> {
    const request = ++this.surfaceUpdate;
    this.surfaceUpdating = true;
    this.updateConstructionView();
    this.updateRoomHighlight();
    try {
      await update();
    } finally {
      if (!this.disposed && request === this.surfaceUpdate) {
        this.surfaceUpdating = false;
        this.wallColorPreview.apply(this.floorplanScene.currentGroup, this.interiorWallColors);
        this.updateRoomHighlight();
        this.updateConstructionView();
      }
    }
  }

  private updateRoomHighlight(): void {
    const selected = this.viewMode === 'overview' && !this.surfaceUpdating ? this.selectedSceneRoom : null;
    this.roomHighlight.show(this.floorplanScene.currentGroup, selected);
  }

  private updateConstructionView(): void {
    this.constructionBoardView.setEnabled(this.viewMode === 'overview' && !this.surfaceUpdating && this.constructionView, this.floorplanScene.currentGroup);
  }

  async loadExampleFloorplan(): Promise<void> {
    this.exampleSvg ??= fetch(FLOORPLAN_URL).then(response => {
      if (!response.ok) throw new Error('No se pudo cargar el plano de ejemplo.');
      return response.text();
    }).catch(error => {
      this.exampleSvg = null;
      throw error;
    });
    await this.loadFloorplanFromSvgText(await this.exampleSvg);
  }

  private async initialize(loadExample: boolean): Promise<void> {
    try {
      await (loadExample ? this.loadExampleFloorplan() : Promise.resolve());
      if (!this.disposed) this.callbacks.onReady?.();
    } catch (error) {
      if (!this.disposed) this.callbacks.onError?.(error);
    }
  }

  private readonly animate = (): void => {
    const deltaTime = Math.min(MAX_DELTA_TIME, this.clock.getDelta()) / STEPS_PER_FRAME;
    if (this.viewMode === 'walk' && (this.lookInput.isLocked || this.touchInput.enabled)) {
      for (let i = 0; i < STEPS_PER_FRAME; i++) this.player.update(deltaTime);
    } else if (this.viewMode === 'overview') {
      this.overview.update();
    }
    this.renderer.render(this.scene, this.viewMode === 'overview' ? this.overview.camera : this.camera);
  };

  private handleResize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.overview.resize(width / height);
    this.renderer.setSize(width, height, false);
  }

  private containerAspect(): number {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    return width / height;
  }
}
