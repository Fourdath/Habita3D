import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonContent, IonSpinner } from '@ionic/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogProductPhotoComponent } from '../../core/ep2/catalog-product-photo.component';
import { Ep2ApiService, apiError, money } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import type { Project, ProjectBudget, ProjectFloorplan, ProjectRoom, Publication, SceneRoom } from '../../core/ep2/ep2.types';

import type { ConstructionBudgetSummary } from '../../core/budget/budget.types';
import type { InteriorStyleId } from '../../core/interior-style/interior-style.types';
import { readFloorplanFile, validateProjectFloorplanSvg } from '../../core/floorplan/floorplan-file';

import { VIEWER_ENGINE_FACTORY, type ViewerEngine } from './engine/viewer-engine.factory';
import { CONSTRUCTION_VIEW_LEGEND } from './engine/construction-board-view';
import type { FloorFinishId } from './engine/floor-finishes';
import type { RoomFloorSelection } from './engine/room-floor-selection';
import type { InteriorWallColors, ViewerStatus } from './engine/viewer-3d.types';
import type { WalkDirection } from './engine/touch-walk-input';
import { FloorAppearancePanelComponent } from './floor-appearance-panel.component';
import { InteriorStylePanelComponent } from './interior-style-panel.component';
import { ViewerFloorCatalogComponent } from './viewer-floor-catalog.component';
import { BrandMarkComponent } from '../landing/components/brand-mark.component';
import { FloorSuggestionsComponent } from '../recommendations/floor-suggestions.component';

const EXAMPLE_MODEL_NAME = 'Vivienda de demostración';

interface FloorPreview {
  finishId?: FloorFinishId;
  tint?: string;
}

interface SuggestedFloorPreview {
  sceneRoomId: string;
  publication: Publication;
}

const ORIGINAL_WALLS: InteriorWallColors = { all: null, rooms: new Map() };

@Component({
  selector: 'app-viewer-3d',
  templateUrl: 'viewer-3d.page.html',
  styleUrls: ['viewer-3d.page.scss'],
  imports: [IonContent, IonSpinner, FloorAppearancePanelComponent, InteriorStylePanelComponent, ViewerFloorCatalogComponent, RouterLink, BrandMarkComponent, CatalogProductPhotoComponent, FloorSuggestionsComponent],
})
export class Viewer3DPage implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost', { static: true })
  private readonly canvasHostRef!: ElementRef<HTMLDivElement>;

  readonly status = signal<ViewerStatus>('loading');
  readonly pointerLocked = signal(false);
  readonly walkError = signal<string | null>(null);
  readonly viewMode = signal<'walk' | 'overview'>('overview');
  readonly topView = signal(false);
  readonly constructionView = signal(false);
  readonly constructionLegend = CONSTRUCTION_VIEW_LEGEND;
  readonly modelName = signal(EXAMPLE_MODEL_NAME);
  readonly modelSummary = signal({ roomCount: 0, areaM2: 0 });
  readonly pointerLockSupported = typeof HTMLElement.prototype.requestPointerLock === 'function';
  readonly touchSupported = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches === true;
  readonly touchWalk = signal(false);
  readonly directions: { direction: WalkDirection; label: string; arrow: string }[] = [
    { direction: 'forward', label: 'Avanzar', arrow: '↑' },
    { direction: 'left', label: 'Moverse a la izquierda', arrow: '←' },
    { direction: 'backward', label: 'Retroceder', arrow: '↓' },
    { direction: 'right', label: 'Moverse a la derecha', arrow: '→' },
  ];
  readonly errorMessage = signal('');
  readonly projectMode = signal(false);
  readonly projectId = signal<number | null>(null);
  readonly projectRoomId = signal<string | null>(null);
  readonly project = signal<Project | null>(null);
  readonly projectFloorplan = signal<ProjectFloorplan | null>(null);
  readonly modelReady = computed(() => this.status() === 'ready' && (!this.projectMode() || !!this.project()));
  readonly projectBudget = signal<ProjectBudget | null>(null);
  readonly projectLoading = signal(false);
  readonly projectError = signal('');
  readonly projectBudgetError = signal('');
  readonly captureWarning = signal('');
  readonly unmappedRooms = signal<string[]>([]);
  private readonly pickedProjectSceneRoom = signal<string | null>(null);
  readonly selectedProjectRoom = computed(() => {
    const rooms = this.project()?.rooms ?? [];
    const picked = this.pickedProjectSceneRoom();
    return picked ? rooms.find(room => room.sceneRoomId === picked) ?? null
      : rooms.find(room => room.id === this.projectRoomId()) ?? rooms[0] ?? null;
  });
  readonly selectedRoomBudget = computed(() => this.projectBudget()?.rooms.find(room => room.room_id === this.selectedProjectRoom()?.id) ?? null);
  readonly money = money;
  readonly sceneRooms = signal<SceneRoom[]>([]);
  private readonly freeFloorRoomId = signal<string | null>(null);
  private readonly freeFloorPreviews = signal(new Map<string, FloorPreview>());
  readonly appearanceRooms = computed(() => this.projectMode()
    ? this.sceneRooms().filter(room => room.id === (this.pickedProjectSceneRoom() ?? this.selectedProjectRoom()?.sceneRoomId))
    : this.sceneRooms());
  readonly appearanceRoomId = computed(() => {
    const rooms = this.appearanceRooms();
    return rooms.find(room => room.id === this.freeFloorRoomId())?.id ?? rooms[0]?.id ?? null;
  });
  readonly activeFloorPreview = computed(() => {
    const roomId = this.appearanceRoomId();
    return !this.projectMode() && roomId ? this.freeFloorPreviews().get(roomId) : undefined;
  });
  readonly floorUpdating = signal(false);
  readonly suggestionPending = signal(false);
  readonly projectFloorBusy = computed(() => this.floorUpdating() || this.projectLoading() || this.suggestionPending());
  readonly floorAppearanceError = signal('');
  readonly floorCatalogMessage = signal('');
  readonly floorCatalogError = signal('');
  readonly suggestedFloorPreview = signal<SuggestedFloorPreview | null>(null);
  readonly previewLoading = signal(false);
  readonly previewError = signal('');
  private readonly freeWallColors = signal(ORIGINAL_WALLS);
  private readonly projectWallColors = signal(ORIGINAL_WALLS);
  readonly activeWallColors = computed(() => this.projectMode() ? this.projectWallColors() : this.freeWallColors());
  readonly wallPaint = signal('#e6ded0');
  readonly activeWallRoom = computed(() => this.appearanceRooms().find(room => room.id === this.appearanceRoomId()));
  readonly roomWallOverride = computed(() => this.activeWallColors().rooms.get(this.appearanceRoomId() ?? ''));

  readonly loadingFloorplan = signal(false);
  readonly floorplanError = signal<string | null>(null);

  readonly interiorStyleId = signal<InteriorStyleId>('none');
  readonly interiorStyleLoading = signal(false);
  readonly interiorStyleError = signal<string | null>(null);
  readonly budget = signal<ConstructionBudgetSummary>({
    styleId: 'none',
    isDemoPricing: true,
    items: [],
    totalClp: 0,
    requiresStructuralSpecification: false,
  });

  private readonly createEngine = inject(VIEWER_ENGINE_FACTORY);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(Ep2ApiService);
  private readonly session = inject(SessionService);
  private projectRequest = 0;
  private previewRequest = 0;
  private previewKey: string | null = null;
  private engine: ViewerEngine | null = null;
  private freePlan: { svgText: string; name: string } | null = null;
  private loadedSvg: string | null | undefined = null;
  private sceneProjectMode = false;
  private pendingScene = Promise.resolve();
  private previewFloorplanRevision: string | null = null;

  constructor() {
    effect(() => {
      const id = this.appearanceRoomId();
      const colors = this.activeWallColors();
      if (this.status() !== 'ready') return;
      this.engine?.setSelectedSceneRoom(id);
      this.engine?.setInteriorWallColors(colors);
    });
  }

  ngAfterViewInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const raw = params.get('project');
      const id = raw && /^[1-9]\d*$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null;
      const saved = params.has('project');
      const modeChanged = saved !== this.projectMode() || id !== this.projectId();
      const room = params.get('room');
      const roomChanged = room !== this.projectRoomId();
      const preview = params.get('preview');
      const previewChanged = preview !== this.previewKey;
      this.previewKey = preview;
      this.projectMode.set(saved);
      this.projectId.set(id);
      this.projectRoomId.set(room);
      if (modeChanged || roomChanged) {
        this.pickedProjectSceneRoom.set(null);
        this.floorCatalogMessage.set('');
        this.floorCatalogError.set('');
        this.floorAppearanceError.set('');
      }
      if (this.status() !== 'ready') return;
      if (modeChanged || saved && !this.project()) void this.loadActiveProject();
      else if (saved && (roomChanged || previewChanged)) void this.syncFloorPreview();
    });
    if (this.projectMode()) {
      this.loadedSvg = undefined;
      this.modelName.set('Proyecto');
    }
    try {
      this.engine = this.createEngine(this.canvasHostRef.nativeElement, {
        onReady: () => {
          this.status.set('ready');
          this.refreshStyleState();
          void this.loadActiveProject();
        },
        onError: (error) => this.handleError(error),
        onPointerLockChange: (locked) => this.pointerLocked.set(locked),
        onRoomPick: roomId => this.pickSceneRoom(roomId),
        onPointerLockError: () => this.walkError.set('El navegador no permitió controlar el mouse. Intenta de nuevo desde «Comenzar recorrido» o abre el visor en tu navegador habitual.'),
      }, !this.projectMode());
    } catch (error) {
      this.handleError(error);
    }
  }

  ngOnDestroy(): void {
    ++this.projectRequest;
    ++this.previewRequest;
    this.engine?.dispose();
    this.engine = null;
  }

  // Ionic can retain the page between visits; each entry starts with the model.
  ionViewWillEnter(): void {
    this.onViewModeChange('overview');
    if (this.status() === 'ready' && this.projectMode()) void this.loadActiveProject();
  }

  ionViewWillLeave(): void {
    this.onViewModeChange('overview');
  }

  onStartClick(event?: MouseEvent): void {
    if (!this.modelReady() || this.loadingFloorplan() || this.interiorStyleLoading() || this.projectFloorBusy()) return;
    this.walkError.set(null);
    const touched = event && 'pointerType' in event && event.pointerType === 'touch';
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches === true;
    this.touchWalk.set(this.touchSupported && (touched || coarsePointer || !this.pointerLockSupported));
    this.onViewModeChange('walk');
    if (this.touchWalk()) this.engine?.setTouchWalkEnabled(true);
    else if (this.pointerLockSupported) this.engine?.requestPointerLock();
  }

  onViewModeChange(mode: 'walk' | 'overview'): void {
    if (mode === 'overview') this.touchWalk.set(false);
    if (mode === 'walk' && this.constructionView()) this.toggleConstructionView(false);
    this.engine?.setViewMode(mode);
    this.viewMode.set(mode);
  }

  onTouchDirection(direction: WalkDirection, pressed: boolean, event?: PointerEvent): void {
    if (pressed && event) {
      if (event.button !== 0) return;
      (event.currentTarget as HTMLButtonElement).setPointerCapture?.(event.pointerId);
    }
    this.engine?.setTouchDirection(direction, pressed);
  }

  onFrameOverview(top = false): void {
    if (this.constructionView()) this.toggleConstructionView(false);
    this.topView.set(top);
    this.engine?.frameOverview(top);
  }

  toggleConstructionView(enabled = true): void {
    this.constructionView.set(enabled);
    this.engine?.setConstructionView(enabled);
    if (!enabled) return;
    if (this.previewKey) void this.closeFloorPreview();
    this.topView.set(false);
    requestAnimationFrame(() => {
      if (this.constructionView()) {
        this.canvasHostRef.nativeElement.closest('.studio')?.querySelector('#board-title')?.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }

  boardLine(productId: typeof CONSTRUCTION_VIEW_LEGEND[number]['productId']) {
    return (line: ConstructionBudgetSummary['items'][number]) => line.productId === productId;
  }

  onZoom(factor: number): void {
    this.engine?.zoomOverview(factor);
  }

  async selectProjectRoom(event: Event): Promise<void> {
    if (this.projectFloorBusy()) return;
    const room = (event.target as HTMLSelectElement).value;
    this.pickedProjectSceneRoom.set(null);
    await this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.projectId(), room }, replaceUrl: true });
  }

  private pickSceneRoom(roomId: string): void {
    if (this.constructionView() || this.projectFloorBusy() || this.loadingFloorplan()) return;
    if (!this.sceneRooms().some(room => room.id === roomId)) return;
    if (this.projectMode()) {
      this.pickedProjectSceneRoom.set(roomId);
      const linked = this.selectedProjectRoom();
      if (linked && linked.id !== this.projectRoomId()) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.projectId(), room: linked.id }, replaceUrl: true });
      } else if (!linked && this.previewKey) {
        void this.closeFloorPreview();
      }
    } else this.selectAppearanceRoom(roomId);
    this.floorAppearanceError.set('');
    this.floorCatalogError.set('');
    this.floorCatalogMessage.set('');
    this.canvasHostRef.nativeElement.closest('.studio')?.querySelector('#floor-editor')?.scrollIntoView?.({ block: 'nearest' });
  }

  updateWallPaint(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^#[a-f0-9]{6}$/i.test(value)) this.wallPaint.set(value);
  }

  paintInterior(scope: 'room' | 'all', color: string | null = this.wallPaint()): void {
    const source = this.projectMode() ? this.projectWallColors : this.freeWallColors;
    if (scope === 'all') {
      source.set({ all: color, rooms: new Map() });
      return;
    }
    const id = this.appearanceRoomId();
    if (!id) return;
    const rooms = new Map(source().rooms);
    if (color) rooms.set(id, color);
    else rooms.delete(id);
    source.set({ all: source().all, rooms });
  }

  selectAppearanceRoom(roomId: string): void {
    if (this.projectMode() || !this.sceneRooms().some(room => room.id === roomId)) return;
    this.freeFloorRoomId.set(roomId);
    this.floorAppearanceError.set('');
  }

  changeFloorFinish(finishId: FloorFinishId | null): Promise<void> {
    return this.updateFloorAppearance({ ...this.activeFloorPreview(), finishId: finishId ?? undefined });
  }

  changeFloorTint(tint: string | null): Promise<void> {
    return this.updateFloorAppearance({ ...this.activeFloorPreview(), tint: tint ?? undefined });
  }

  resetFloorAppearance(): Promise<void> {
    return this.updateFloorAppearance({});
  }

  previewFloorThroughoutHouse(): Promise<void> {
    return this.updateFloorAppearance(this.activeFloorPreview() ?? {}, this.sceneRooms().map(room => room.id));
  }

  async saveCatalogFloor(publication: Publication, wholeHouse = false): Promise<void> {
    const project = this.project();
    const room = this.selectedProjectRoom();
    if (this.projectFloorBusy() || !project || (!wholeHouse && (!room || room.publicationKey === publication.publicationKey))) return;
    if (wholeHouse && this.unmappedRooms().length) {
      this.floorCatalogError.set('Vincula las habitaciones existentes al plano antes de aplicar el piso a toda la casa.');
      return;
    }
    const request = this.projectRequest;
    this.floorUpdating.set(true);
    this.floorCatalogMessage.set('');
    this.floorCatalogError.set('');
    this.floorAppearanceError.set('');
    try {
      const updated = wholeHouse
        ? await this.api.saveProjectFloor(project.id, publication.publicationKey, this.sceneRooms().map(scene => ({
            id: scene.id, name: scene.name.slice(0, 120), areaM2: scene.areaM2.toFixed(6),
          })), this.projectFloorplan()?.revision)
        : this.withUpdatedRoom(project, await this.api.saveRoom(project.id, { publicationKey: publication.publicationKey }, room!.id));
      if (request !== this.projectRequest) return;
      await this.applySavedFloors(
        updated, request, wholeHouse ? 'Piso guardado en todos los recintos del plano.' : 'Piso guardado en la habitación.',
      );
    } catch (error) {
      if (request === this.projectRequest) this.floorCatalogError.set(apiError(error));
    } finally {
      this.floorUpdating.set(false);
    }
  }

  saveFloorPreferences(room: ProjectRoom): void {
    const project = this.project();
    if (project?.id === room.projectId) this.project.set(this.withUpdatedRoom(project, room));
  }

  async useSuggestedFloor(room: ProjectRoom): Promise<void> {
    const project = this.project();
    if (project?.id !== room.projectId || this.projectLoading()) return;
    const request = this.projectRequest;
    this.floorUpdating.set(true);
    this.floorCatalogError.set('');
    this.floorAppearanceError.set('');
    try {
      await this.applySavedFloors(this.withUpdatedRoom(project, room), request, `Piso guardado en ${room.name}.`);
    } finally {
      this.floorUpdating.set(false);
    }
  }

  async closeFloorPreview(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { preview: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async syncFloorPreview(): Promise<void> {
    const request = ++this.previewRequest;
    const project = this.project();
    const key = this.previewKey;
    const restoring = this.previewLoading() || this.suggestedFloorPreview() !== null;
    const current = () => request === this.previewRequest;
    this.previewError.set('');
    if (!project || !key && !restoring) return;
    this.previewLoading.set(true);
    try {
      if (restoring) {
        await this.updateScene(async () => {
          if (current()) await this.applyFloorVisuals(project);
        });
        if (!current()) return;
        this.suggestedFloorPreview.set(null);
      }
      if (!key) return;
      const room = project.rooms.find(item => item.id === this.projectRoomId());
      const sceneRoomId = room?.sceneRoomId;
      if (!sceneRoomId || !this.sceneRooms().some(scene => scene.id === sceneRoomId)) {
        this.previewError.set('Vincula la habitación al plano para previsualizar el piso.');
        return;
      }
      if (!/^[a-f0-9]{64}$/.test(key)) {
        this.previewError.set('La referencia del piso no es válida.');
        return;
      }
      const publication = await this.api.publication(key);
      if (!current()) return;
      if (publication.publicationKey !== key || !['ceramic', 'laminate'].includes(publication.category) || publication.saleUnit !== 'box') {
        this.previewError.set('Este producto no tiene un acabado de piso disponible.');
        return;
      }
      const preview = { sceneRoomId, publication };
      await this.updateScene(async () => {
        if (!current()) return;
        if (this.constructionView()) this.onFrameOverview();
        await this.applyFloorVisuals(project, undefined, preview);
      });
      if (current()) this.suggestedFloorPreview.set(preview);
    } catch {
      if (current()) this.previewError.set('No se pudo mostrar el piso en 3D. Vuelve a abrir la vista previa.');
    } finally {
      if (current()) this.previewLoading.set(false);
    }
  }

  focusFloorCatalog(target: HTMLElement): void {
    const details = target.querySelector('details');
    if (details) details.open = true;
    (details?.querySelector('summary') ?? target).focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'nearest' });
  }

  async refreshProjectBudget(): Promise<void> {
    const project = this.project();
    if (!project || this.projectFloorBusy()) return;
    const request = this.projectRequest;
    this.floorUpdating.set(true);
    this.projectBudgetError.set('');
    try {
      const [result] = await Promise.allSettled([this.api.budget(project.id)]);
      if (request === this.projectRequest) this.showProjectBudget(result);
    } finally {
      this.floorUpdating.set(false);
    }
  }

  private withUpdatedRoom(project: Project, room: ProjectRoom): Project {
    return { ...project, rooms: project.rooms.map(item => item.id === room.id ? room : item) };
  }

  private async applySavedFloors(updated: Project, request: number, message: string): Promise<void> {
    if (this.previewKey) {
      await this.closeFloorPreview();
      if (request !== this.projectRequest) return;
    }
    this.project.set(updated);
    this.floorCatalogMessage.set(message);
    this.projectBudget.set(null);
    this.projectBudgetError.set('');
    this.refreshUnmappedRooms(updated);
    const [appearance, budget] = await Promise.allSettled([
      this.updateScene(async () => {
        if (request === this.projectRequest) await this.applyFloorVisuals(updated);
      }),
      this.api.budget(updated.id),
    ]);
    if (request !== this.projectRequest) return;
    if (appearance.status === 'rejected') this.floorAppearanceError.set('El piso se guardó. Reabre el visor para actualizar el modelo.');
    this.showProjectBudget(budget);
  }

  async loadActiveProject(): Promise<void> {
    const request = ++this.projectRequest;
    ++this.previewRequest;
    this.suggestedFloorPreview.set(null);
    this.previewLoading.set(false);
    this.previewError.set('');
    const saved = this.projectMode();
    const freePlan = this.freePlan;
    this.suggestionPending.set(false);
    this.projectFloorplan.set(null);
    this.project.set(null); this.projectBudget.set(null); this.projectError.set(''); this.projectBudgetError.set(''); this.captureWarning.set(''); this.unmappedRooms.set([]);
    const resetScene = saved || this.sceneProjectMode || this.loadedSvg !== (freePlan?.svgText ?? null) || this.projectLoading() || this.loadingFloorplan();
    this.projectLoading.set(resetScene);
    try {
      if (!saved) {
        if (resetScene || this.freeFloorPreviews().size) {
          await this.updateScene(async () => {
            if (request !== this.projectRequest) return;
            await this.engine?.setRoomFloorSelections([]);
            if (request !== this.projectRequest) return;
            await this.showGeometry(freePlan?.svgText ?? null);
            if (request !== this.projectRequest) return;
            this.sceneProjectMode = false;
            await this.applyFloorVisuals(null, this.freeFloorPreviews());
          });
        }
        if (request === this.projectRequest) this.modelName.set(freePlan?.name ?? EXAMPLE_MODEL_NAME);
        return;
      }
      this.modelName.set('Proyecto');
      const id = this.projectId();
      if (id === null) { this.projectError.set('El identificador del proyecto no es válido. Abre el proyecto desde Mis proyectos.'); return; }
      if (!this.session.user()) await this.session.restore();
      if (request !== this.projectRequest) return;
      if (!this.session.user()) { this.projectError.set('Inicia sesión en Mis proyectos para recuperar esta vivienda y sus pisos.'); return; }
      const project = await this.api.project(id);
      if (request !== this.projectRequest) return;
      const plan = project.floorplan;
      this.modelName.set(project.name);
      if (!plan) {
        this.projectError.set('Sube un plano SVG de CubiCasa para editar este proyecto en 3D.');
        return;
      }
      validateProjectFloorplanSvg(plan.svg);
      if (this.previewFloorplanRevision !== plan.revision) {
        this.previewFloorplanRevision = plan.revision;
        this.projectWallColors.set(ORIGINAL_WALLS);
      }
      await this.updateScene(async () => {
        if (request !== this.projectRequest) return;
        await this.engine?.setRoomFloorSelections([]);
        if (request !== this.projectRequest) return;
        await this.showGeometry(plan.svg);
        if (request !== this.projectRequest) return;
        this.sceneProjectMode = true;
        this.refreshUnmappedRooms(project);
        await this.applyFloorVisuals(project);
      });
      if (request !== this.projectRequest) return;
      this.projectFloorplan.set(plan);
      this.project.set(project);
      if (this.previewKey) void this.syncFloorPreview();
      const [budget, status] = await Promise.allSettled([this.api.budget(id), this.api.status()]);
      if (request !== this.projectRequest) return;
      this.showProjectBudget(budget);
      if (budget.status === 'rejected' && !this.session.user()) {
        this.project.set(null); this.projectError.set(apiError(budget.reason)); await this.clearRoomFloors(request);
      }
      if (status.status === 'rejected') this.captureWarning.set('No se pudo comprobar el estado de actualización. Revisa las fechas guardadas de cada piso.');
      else if (status.value.latestJob?.status === 'failed' || status.value.groups.some(group => ['failed', 'partial'].includes(group.status))) this.captureWarning.set('La actualización falló o fue incompleta. Se muestran los últimos precios válidos con su fecha anterior.');
    } catch (error) {
      if (request === this.projectRequest) {
        if (saved) {
          this.projectError.set(error instanceof Error && error.message.startsWith('Dos habitaciones') ? error.message : apiError(error));
          await this.clearRoomFloors(request);
        } else {
          this.floorplanError.set(error instanceof Error ? error.message : 'No se pudo recuperar el plano libre.');
        }
      }
    } finally { if (request === this.projectRequest) this.projectLoading.set(false); }
  }

  /**
   * Reads and validates the picked SVG entirely in memory (never uploaded, never
   * written into public/) and remembers it only for the current free viewer.
   */
  async onFloorplanFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || this.projectMode() || this.projectLoading() || this.loadingFloorplan() || this.floorUpdating()) {
      return;
    }

    this.loadingFloorplan.set(true);
    const request = this.projectRequest;
    try {
      const svgText = await readFloorplanFile(file);
      await this.updateScene(async () => {
        if (request !== this.projectRequest || !this.engine) return;
        const geometryChanged = svgText !== this.loadedSvg;
        await this.showGeometry(svgText);
        if (geometryChanged && this.freeFloorPreviews().size) {
          await this.engine.setRoomFloorSelections([]);
          this.freeFloorPreviews.set(new Map());
        }
        if (geometryChanged) this.freeWallColors.set(ORIGINAL_WALLS);
        this.freePlan = { svgText, name: file.name.replace(/\.svg$/i, '') };
        if (request !== this.projectRequest) return;
        this.modelName.set(this.freePlan.name);
        this.floorplanError.set(null);
      });
    } catch (error) {
      if (request === this.projectRequest) this.floorplanError.set(error instanceof Error ? error.message : 'No se pudo cargar el plano seleccionado.');
    } finally {
      this.loadingFloorplan.set(false);
    }
  }

  async onInteriorStyleChange(styleId: InteriorStyleId): Promise<void> {
    this.interiorStyleLoading.set(true);
    try {
      await this.updateScene(async () => this.engine?.applyInteriorStyle(styleId));
      this.interiorStyleId.set(styleId);
      this.interiorStyleError.set(null);
      this.refreshStyleState();
    } catch (error) {
      this.interiorStyleError.set(error instanceof Error ? error.message : 'No se pudo aplicar el estilo seleccionado.');
    } finally {
      this.interiorStyleLoading.set(false);
    }
  }

  private async showGeometry(svgText: string | null): Promise<void> {
    const engine = this.engine;
    if (!engine || this.loadedSvg === svgText) return;
    this.loadedSvg = undefined;
    if (svgText === null) await engine.loadExampleFloorplan();
    else await engine.loadFloorplanFromSvgText(svgText);
    if (this.engine !== engine) return;
    this.loadedSvg = svgText;
    this.onViewModeChange('overview');
    this.onFrameOverview();
    this.refreshStyleState();
  }

  private async clearRoomFloors(request: number): Promise<void> {
    await this.updateScene(async () => {
      if (request === this.projectRequest) await this.engine?.setRoomFloorSelections([]);
    });
  }

  private async updateFloorAppearance(preview: FloorPreview, rooms?: string[]): Promise<void> {
    const sceneRoomId = this.appearanceRoomId();
    if (this.projectMode() || !sceneRoomId || this.floorUpdating() || this.projectLoading() || this.loadingFloorplan() || this.interiorStyleLoading()) return;
    const next = new Map(this.freeFloorPreviews());
    for (const id of rooms ?? [sceneRoomId]) {
      if (preview.finishId || preview.tint) next.set(id, preview);
      else next.delete(id);
    }
    const request = this.projectRequest;
    this.floorUpdating.set(true);
    this.floorAppearanceError.set('');
    try {
      await this.updateScene(async () => {
        if (request === this.projectRequest) await this.applyFloorVisuals(null, next);
      });
      if (request === this.projectRequest) this.freeFloorPreviews.set(next);
    } catch {
      if (request === this.projectRequest) this.floorAppearanceError.set('No se pudo aplicar el acabado. Vuelve a intentarlo.');
    } finally {
      this.floorUpdating.set(false);
    }
  }

  private async applyFloorVisuals(project: Project | null, previews = this.freeFloorPreviews(), suggested?: SuggestedFloorPreview): Promise<void> {
    const sceneIds = new Set(this.sceneRooms().map(room => room.id));
    const selections: RoomFloorSelection[] = [];
    if (project) {
      for (const room of project.rooms) {
        const { sceneRoomId } = room;
        const publication = suggested?.sceneRoomId === sceneRoomId ? suggested.publication : room.publication;
        if (!sceneRoomId || !sceneIds.has(sceneRoomId) || !publication) continue;
        selections.push({
          sceneRoomId,
          publicationKey: publication.publicationKey,
          publicationName: publication.name,
          category: publication.category,
        });
      }
    } else {
      for (const [sceneRoomId, preview] of previews) {
        if (sceneIds.has(sceneRoomId)) selections.push({ sceneRoomId, ...preview });
      }
    }
    await this.engine?.setRoomFloorSelections(selections);
  }

  private showProjectBudget(result: PromiseSettledResult<ProjectBudget>): void {
    this.projectBudget.set(result.status === 'fulfilled' ? result.value : null);
    this.projectBudgetError.set(result.status === 'rejected' ? apiError(result.reason) : '');
  }

  private refreshUnmappedRooms(project: Project): void {
    const sceneIds = new Set(this.sceneRooms().map(room => room.id));
    this.unmappedRooms.set(project.rooms.filter(room => !room.sceneRoomId || !sceneIds.has(room.sceneRoomId)).map(room => room.name));
  }

  private updateScene(update: () => Promise<void>): Promise<void> {
    const next = this.pendingScene.then(update);
    this.pendingScene = next.catch(() => undefined);
    return next;
  }

  private refreshStyleState(): void {
    if (!this.engine) {
      return;
    }
    this.budget.set(this.engine.getBudget());
    this.modelSummary.set(this.engine.getModelSummary());
    const sceneRooms = this.engine.getSceneRooms();
    this.sceneRooms.set(sceneRooms);
    if (!this.projectMode() && !sceneRooms.some(room => room.id === this.freeFloorRoomId())) {
      this.freeFloorRoomId.set(sceneRooms[0]?.id ?? null);
    }
  }

  private handleError(error: unknown): void {
    this.status.set('error');
    this.errorMessage.set(error instanceof Error ? error.message : 'Error desconocido al iniciar el visor 3D.');
  }
}
