import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonContent, IonSpinner } from '@ionic/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Ep2ApiService, apiError, money } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import type { Project, ProjectBudget, Publication, SceneRoom } from '../../core/ep2/ep2.types';

import type { ConstructionBudgetSummary } from '../../core/budget/budget.types';
import type { InteriorStyleId } from '../../core/interior-style/interior-style.types';
import { readFloorplanFile } from '../../core/floorplan/floorplan-file';

import { VIEWER_ENGINE_FACTORY, type ViewerEngine } from './engine/viewer-engine.factory';
import { CONSTRUCTION_VIEW_LEGEND } from './engine/construction-board-view';
import { finishForPublication, type FloorFinishId } from './engine/floor-finishes';
import type { RoomFloorSelection } from './engine/room-floor-selection';
import type { InteriorWallColors, ViewerStatus } from './engine/viewer-3d.types';
import type { WalkDirection } from './engine/touch-walk-input';
import { FloorAppearancePanelComponent } from './floor-appearance-panel.component';
import { InteriorStylePanelComponent } from './interior-style-panel.component';
import { ViewerFloorCatalogComponent } from './viewer-floor-catalog.component';
import { BrandMarkComponent } from '../landing/components/brand-mark.component';

const EXAMPLE_MODEL_NAME = 'Vivienda de demostración';

interface FloorPreview {
  finishId?: FloorFinishId;
  tint?: string;
}

const ORIGINAL_WALLS: InteriorWallColors = { all: null, rooms: new Map() };

@Component({
  selector: 'app-viewer-3d',
  templateUrl: 'viewer-3d.page.html',
  styleUrls: ['viewer-3d.page.scss'],
  imports: [IonContent, IonSpinner, FloorAppearancePanelComponent, InteriorStylePanelComponent, ViewerFloorCatalogComponent, RouterLink, BrandMarkComponent],
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
  private readonly projectFloorPreviews = signal(new Map<string, FloorPreview>());
  readonly appearanceRooms = computed(() => this.projectMode()
    ? this.sceneRooms().filter(room => room.id === (this.pickedProjectSceneRoom() ?? this.selectedProjectRoom()?.sceneRoomId))
    : this.sceneRooms());
  readonly appearanceRoomId = computed(() => {
    const rooms = this.appearanceRooms();
    return rooms.find(room => room.id === this.freeFloorRoomId())?.id ?? rooms[0]?.id ?? null;
  });
  readonly activeFloorPreview = computed(() => {
    const previews = this.projectMode() ? this.projectFloorPreviews() : this.freeFloorPreviews();
    const roomId = this.appearanceRoomId();
    return roomId ? previews.get(roomId) : undefined;
  });
  readonly floorUpdating = signal(false);
  readonly floorAppearanceError = signal('');
  readonly floorCatalogMessage = signal('');
  readonly floorCatalogError = signal('');
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
  private engine: ViewerEngine | null = null;
  private freePlan: { svgText: string; name: string } | null = null;
  private loadedSvg: string | null | undefined = null;
  private sceneProjectMode = false;
  private pendingScene = Promise.resolve();
  private previewProjectId: number | null = null;

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
      });
    } catch (error) {
      this.handleError(error);
    }
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const raw = params.get('project');
      const id = raw && /^[1-9]\d*$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null;
      const saved = params.has('project');
      const modeChanged = saved !== this.projectMode() || id !== this.projectId();
      this.projectMode.set(saved);
      this.projectId.set(id);
      this.projectRoomId.set(params.get('room'));
      this.pickedProjectSceneRoom.set(null);
      this.floorCatalogMessage.set('');
      this.floorCatalogError.set('');
      this.floorAppearanceError.set('');
      if (this.status() === 'ready' && (modeChanged || saved && !this.project())) void this.loadActiveProject();
    });
  }

  ngOnDestroy(): void {
    ++this.projectRequest;
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
    if (this.status() !== 'ready' || this.loadingFloorplan() || this.interiorStyleLoading() || this.projectLoading() || this.floorUpdating()) return;
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
    const room = (event.target as HTMLSelectElement).value;
    this.pickedProjectSceneRoom.set(null);
    await this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.projectId(), room }, replaceUrl: true });
  }

  private pickSceneRoom(roomId: string): void {
    if (this.constructionView() || this.projectLoading() || this.floorUpdating() || this.loadingFloorplan()) return;
    if (!this.sceneRooms().some(room => room.id === roomId)) return;
    if (this.projectMode()) {
      this.pickedProjectSceneRoom.set(roomId);
      const linked = this.selectedProjectRoom();
      if (linked && linked.id !== this.projectRoomId()) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.projectId(), room: linked.id }, replaceUrl: true });
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
    if (this.floorUpdating() || this.projectLoading() || !project || (!wholeHouse && (!room || room.publicationKey === publication.publicationKey))) return;
    const request = this.projectRequest;
    this.floorUpdating.set(true);
    this.floorCatalogMessage.set('');
    this.floorCatalogError.set('');
    this.floorAppearanceError.set('');
    try {
      const updated = wholeHouse
        ? await this.api.saveProjectFloor(project.id, publication.publicationKey, this.sceneRooms().map(scene => ({
            id: scene.id, name: scene.name.slice(0, 120), areaM2: scene.areaM2.toFixed(6),
          })))
        : await this.api.saveRoom(project.id, { publicationKey: publication.publicationKey }, room!.id).then(updatedRoom => ({
            ...project, rooms: project.rooms.map(item => item.id === updatedRoom.id ? updatedRoom : item),
          }));
      if (request !== this.projectRequest) return;
      this.project.set(updated);
      this.floorCatalogMessage.set(wholeHouse ? 'Piso guardado en todos los recintos del plano.' : 'Piso guardado en la habitación.');
      const previews = new Map(this.projectFloorPreviews());
      for (const scene of wholeHouse ? this.sceneRooms() : this.sceneRooms().filter(item => item.id === room?.sceneRoomId)) previews.delete(scene.id);
      this.projectFloorPreviews.set(previews);
      this.refreshUnmappedRooms(updated);
      const [appearance, budget] = await Promise.allSettled([
        this.updateScene(async () => {
          if (request === this.projectRequest) await this.applyFloorVisuals(updated, this.projectFloorPreviews());
        }),
        this.api.budget(project.id),
      ]);
      if (request !== this.projectRequest) return;
      if (appearance.status === 'rejected') this.floorAppearanceError.set('El piso se guardó. Reabre el visor para actualizar el modelo.');
      this.showProjectBudget(budget);
    } catch (error) {
      if (request === this.projectRequest) this.floorCatalogError.set(apiError(error));
    } finally {
      this.floorUpdating.set(false);
    }
  }

  async loadActiveProject(): Promise<void> {
    const request = ++this.projectRequest;
    const saved = this.projectMode();
    const freePlan = saved ? null : this.freePlan;
    const targetSvg = freePlan?.svgText ?? null;
    this.project.set(null); this.projectBudget.set(null); this.projectError.set(''); this.projectBudgetError.set(''); this.captureWarning.set(''); this.unmappedRooms.set([]);
    const resetScene = saved || this.sceneProjectMode || this.loadedSvg !== targetSvg || this.projectLoading() || this.loadingFloorplan();
    this.projectLoading.set(resetScene);
    try {
      if (resetScene) {
        await this.updateScene(async () => {
          if (request !== this.projectRequest) return;
          await this.engine?.setRoomFloorSelections([]);
          if (request !== this.projectRequest) return;
          await this.showGeometry(targetSvg);
          this.sceneProjectMode = saved;
        });
      }
      if (request !== this.projectRequest) return;
      this.modelName.set(freePlan?.name ?? EXAMPLE_MODEL_NAME);
      if (!saved) {
        if (this.freeFloorPreviews().size) await this.updateScene(async () => {
          if (request === this.projectRequest) await this.applyFloorVisuals(null, this.freeFloorPreviews());
        });
        return;
      }
      const id = this.projectId();
      if (id === null) { this.projectError.set('El identificador del proyecto no es válido. Abre el proyecto desde Mis proyectos.'); return; }
      if (this.previewProjectId !== id) {
        this.previewProjectId = id;
        this.projectFloorPreviews.set(new Map());
        this.projectWallColors.set(ORIGINAL_WALLS);
      }
      if (!this.session.user()) await this.session.restore();
      if (request !== this.projectRequest) return;
      if (!this.session.user()) { this.projectError.set('Inicia sesión en Mis proyectos para recuperar esta vivienda y sus pisos.'); return; }
      const project = await this.api.project(id);
      if (request !== this.projectRequest) return;
      this.refreshUnmappedRooms(project);
      await this.updateScene(async () => {
        if (request !== this.projectRequest) return;
        await this.applyFloorVisuals(project, this.projectFloorPreviews());
      });
      if (request !== this.projectRequest) return;
      this.project.set(project); this.modelName.set(project.name);
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
    if (!sceneRoomId || this.floorUpdating() || this.projectLoading() || this.loadingFloorplan() || this.interiorStyleLoading()) return;
    const saved = this.projectMode();
    const source = saved ? this.projectFloorPreviews : this.freeFloorPreviews;
    const next = new Map(source());
    for (const id of rooms ?? [sceneRoomId]) {
      if (preview.finishId || preview.tint) next.set(id, preview);
      else next.delete(id);
    }
    const request = this.projectRequest;
    this.floorUpdating.set(true);
    this.floorAppearanceError.set('');
    try {
      await this.updateScene(async () => {
        if (request === this.projectRequest) await this.applyFloorVisuals(this.project(), next);
      });
      if (request === this.projectRequest) source.set(next);
    } catch {
      if (request === this.projectRequest) this.floorAppearanceError.set('No se pudo aplicar el acabado. Vuelve a intentarlo.');
    } finally {
      this.floorUpdating.set(false);
    }
  }

  private async applyFloorVisuals(project: Project | null, previews: ReadonlyMap<string, FloorPreview>): Promise<void> {
    const sceneIds = new Set(this.sceneRooms().map(room => room.id));
    const selections: RoomFloorSelection[] = [];
    for (const room of project?.rooms ?? []) {
      const sceneRoomId = room.sceneRoomId;
      if (!sceneRoomId || !sceneIds.has(sceneRoomId) || !room.publication) continue;
      const publication = room.publication;
      const preview = previews.get(sceneRoomId);
      selections.push({ sceneRoomId, publicationKey: publication.publicationKey, category: publication.category,
        finishId: preview?.finishId ?? finishForPublication(publication.category, publication.name), tint: preview?.tint });
    }
    const selected = new Set(selections.map(selection => selection.sceneRoomId));
    for (const [sceneRoomId, preview] of previews) {
      if (sceneIds.has(sceneRoomId) && !selected.has(sceneRoomId)) selections.push({ sceneRoomId, ...preview });
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
