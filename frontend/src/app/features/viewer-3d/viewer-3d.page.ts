import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonContent, IonSpinner } from '@ionic/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Ep2ApiService, apiError, money } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import type { Project, ProjectBudget } from '../../core/ep2/ep2.types';

import type { ConstructionBudgetSummary } from '../../core/budget/budget.types';
import type { InteriorStyleId } from '../../core/interior-style/interior-style.types';
import { readFloorplanFile } from '../../core/floorplan/floorplan-file';

import { VIEWER_ENGINE_FACTORY, type ViewerEngine } from './engine/viewer-engine.factory';
import type { ViewerStatus } from './engine/viewer-3d.types';
import type { WalkDirection } from './engine/touch-walk-input';
import { InteriorStylePanelComponent } from './interior-style-panel.component';
import { BrandMarkComponent } from '../landing/components/brand-mark.component';

const EXAMPLE_MODEL_NAME = 'Vivienda de demostración';

@Component({
  selector: 'app-viewer-3d',
  templateUrl: 'viewer-3d.page.html',
  styleUrls: ['viewer-3d.page.scss'],
  imports: [IonContent, IonSpinner, InteriorStylePanelComponent, RouterLink, BrandMarkComponent],
})
export class Viewer3DPage implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost', { static: true })
  private readonly canvasHostRef!: ElementRef<HTMLDivElement>;

  readonly status = signal<ViewerStatus>('loading');
  readonly pointerLocked = signal(false);
  readonly walkError = signal<string | null>(null);
  readonly viewMode = signal<'walk' | 'overview'>('overview');
  readonly topView = signal(false);
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
  readonly selectedProjectRoom = computed(() => this.project()?.rooms.find(room => room.id === this.projectRoomId()) ?? this.project()?.rooms[0] ?? null);
  readonly selectedRoomBudget = computed(() => this.projectBudget()?.rooms.find(room => room.room_id === this.selectedProjectRoom()?.id) ?? null);
  readonly money = money;

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
        onPointerLockError: () => this.walkError.set('El navegador no permitió controlar el mouse. Intenta de nuevo desde «Comenzar recorrido» o abre el visor en tu navegador habitual.'),
      });
    } catch (error) {
      this.handleError(error);
    }
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.projectMode.set(params.has('project'));
      const raw = params.get('project');
      this.projectId.set(raw && /^[1-9]\d*$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null);
      this.projectRoomId.set(params.get('room'));
      if (this.status() === 'ready') void this.loadActiveProject();
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
    if (this.status() !== 'ready' || this.loadingFloorplan() || this.interiorStyleLoading() || this.projectLoading()) return;
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
    this.topView.set(top);
    this.engine?.frameOverview(top);
  }

  onZoom(factor: number): void {
    this.engine?.zoomOverview(factor);
  }

  async selectProjectRoom(event: Event): Promise<void> {
    const room = (event.target as HTMLSelectElement).value;
    await this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.projectId(), room }, replaceUrl: true });
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
      if (!saved) return;
      const id = this.projectId();
      if (id === null) { this.projectError.set('El identificador del proyecto no es válido. Abre el proyecto desde Mis proyectos.'); return; }
      if (!this.session.user()) await this.session.restore();
      if (request !== this.projectRequest) return;
      if (!this.session.user()) { this.projectError.set('Inicia sesión en Mis proyectos para recuperar esta vivienda y sus pisos.'); return; }
      const project = await this.api.project(id);
      if (request !== this.projectRequest) return;
      const sceneIds = new Set(this.engine?.getSceneRooms().map(room => room.id));
      const selected = project.rooms.filter(room => room.sceneRoomId && room.publication);
      this.unmappedRooms.set(project.rooms.filter(room => !room.sceneRoomId || !sceneIds.has(room.sceneRoomId)).map(room => room.name));
      await this.updateScene(async () => {
        if (request !== this.projectRequest) return;
        await this.engine?.setRoomFloorSelections(selected.filter(room => sceneIds.has(room.sceneRoomId!)).map(room => ({ sceneRoomId: room.sceneRoomId!, publicationKey: room.publication!.publicationKey, category: room.publication!.category })));
      });
      if (request !== this.projectRequest) return;
      this.project.set(project); this.modelName.set(project.name);
      const [budget, status] = await Promise.allSettled([this.api.budget(id), this.api.status()]);
      if (request !== this.projectRequest) return;
      if (budget.status === 'fulfilled') this.projectBudget.set(budget.value);
      else {
        this.projectBudgetError.set(apiError(budget.reason));
        if (!this.session.user()) { this.project.set(null); this.projectError.set(apiError(budget.reason)); await this.clearRoomFloors(request); }
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
    if (!file || this.projectMode() || this.projectLoading() || this.loadingFloorplan()) {
      return;
    }

    this.loadingFloorplan.set(true);
    const request = this.projectRequest;
    try {
      const svgText = await readFloorplanFile(file);
      await this.updateScene(async () => {
        if (request !== this.projectRequest || !this.engine) return;
        await this.showGeometry(svgText);
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
  }

  private handleError(error: unknown): void {
    this.status.set('error');
    this.errorMessage.set(error instanceof Error ? error.message : 'Error desconocido al iniciar el visor 3D.');
  }
}
