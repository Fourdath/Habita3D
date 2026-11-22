import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Ep2ApiService, apiError, money } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import { ScenePlanService } from '../../core/ep2/scene-plan.service';
import type { Project, ProjectBudget, ProjectFloorplan, ProjectRoom, ProjectSummary, Publication, RoomInput, SceneRoom } from '../../core/ep2/ep2.types';
import { readFloorplanFile } from '../../core/floorplan/floorplan-file';
import { BrandMarkComponent } from '../landing/components/brand-mark.component';
import { FloorSuggestionsComponent } from '../recommendations/floor-suggestions.component';
import { BudgetPanelComponent } from './budget-panel.component';
import { CatalogPanelComponent } from './catalog-panel.component';
import { RoomEditorComponent } from './room-editor.component';

@Component({
  selector: 'app-projects', templateUrl: 'projects.page.html', styleUrls: ['projects.page.scss'],
  imports: [IonContent, RouterLink, ReactiveFormsModule, BrandMarkComponent, BudgetPanelComponent, CatalogPanelComponent, RoomEditorComponent, FloorSuggestionsComponent],
})
export class ProjectsPage implements OnInit {
  readonly session = inject(SessionService);
  private readonly api = inject(Ep2ApiService);
  private readonly scenePlan = inject(ScenePlanService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly projects = signal<ProjectSummary[]>([]);
  readonly project = signal<Project | null>(null);
  readonly budget = signal<ProjectBudget | null>(null);
  readonly sceneRooms = signal<SceneRoom[]>([]);
  readonly floorplan = computed<ProjectFloorplan | null>(() => this.project()?.floorplan ?? null);
  readonly selectedRoomId = signal<string | null>(null);
  readonly selectedRoom = computed(() => this.project()?.rooms.find(room => room.id === this.selectedRoomId()) ?? null);
  readonly loading = signal(true);
  readonly projectLoading = signal(false);
  readonly budgetLoading = signal(false);
  private readonly mutating = signal(false);
  readonly suggestionPending = signal(false);
  readonly busy = computed(() => this.mutating() || this.suggestionPending());
  readonly error = signal('');
  readonly budgetError = signal('');
  readonly sceneError = signal('');
  readonly notice = signal('');
  readonly projectListFailed = signal(false);
  readonly showProjectForm = signal(false);
  readonly editingProjectId = signal<number | undefined>(undefined);
  readonly showRoomForm = signal(false);
  readonly editingRoom = signal<ProjectRoom | null>(null);
  readonly confirmDelete = signal<string | null>(null);
  readonly money = money;
  private readonly catalogTarget = viewChild('catalogTarget', { read: ElementRef<HTMLElement> });
  private initialized = false;
  private request = 0;
  private budgetRequest = 0;
  private requestedProject: number | null = null;
  private requestedRoom: string | null = null;
  private requestedNewProject = false;
  readonly projectForm = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }), budgetClp: new FormControl(200000, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(1e15), Validators.pattern(/^\d+$/)] }) });

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const raw = params.get('project');
      this.requestedProject = raw && /^[1-9]\d*$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null;
      this.requestedRoom = params.get('room');
      this.requestedNewProject = params.get('nuevo') === '1';
      if (this.initialized && this.session.user()) {
        if (this.requestedNewProject) this.newProject();
        else if (this.requestedProject !== (this.project()?.id ?? null)) void this.openProject(this.requestedProject);
        else this.selectedRoomId.set(this.project()?.rooms.some(room => room.id === this.requestedRoom) ? this.requestedRoom : this.project()?.rooms[0]?.id ?? null);
      }
    });
    void this.initialize();
  }

  ionViewWillEnter(): void {
    if (this.initialized && this.session.user() && !this.requestedNewProject && this.requestedProject !== null) {
      void this.openProject(this.requestedProject);
    }
  }

  async initialize(): Promise<void> {
    this.error.set(''); this.loading.set(true); this.projectListFailed.set(false);
    try {
      if (this.session.user()) {
        await this.reloadProjects();
        await this.openProject(this.requestedProject);
        if (this.requestedNewProject) this.newProject();
      }
    } catch (error) { this.projectListFailed.set(true); this.handleError(error); }
    finally { this.initialized = true; this.loading.set(false); }
  }
  async logout(): Promise<void> {
    try { await this.session.logout(); }
    catch (error) { this.handleError(error); }
    finally { await this.router.navigate(['/login']); }
  }
  private async reloadProjects(): Promise<void> { this.projects.set(await this.api.projects()); }
  async selectProject(id: number): Promise<void> {
    if (this.requestedProject === id && this.project()?.id !== id) {
      this.error.set('');
      await this.openProject(id);
      return;
    }
    await this.router.navigate([], { relativeTo: this.route, queryParams: { project: id } });
  }
  async selectRoom(id: string): Promise<void> {
    this.selectedRoomId.set(id); this.showRoomForm.set(false); this.confirmDelete.set(null);
    await this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.project()?.id, room: id }, replaceUrl: true });
  }
  async openProject(id: number | null, preferredRoom = this.requestedRoom): Promise<void> {
    const request = ++this.request;
    ++this.budgetRequest;
    if (this.project()?.id !== id) {
      this.project.set(null);
      this.suggestionPending.set(false);
    }
    this.sceneRooms.set([]);
    this.sceneError.set('');
    this.budget.set(null); this.showRoomForm.set(false); this.showProjectForm.set(false); this.confirmDelete.set(null);
    this.budgetLoading.set(false); this.projectLoading.set(false);
    if (id === null) return;
    this.projectLoading.set(true);
    try {
      const project = await this.api.project(id);
      if (request !== this.request) return;
      this.project.set(project);
      this.selectedRoomId.set(project.rooms.some(room => room.id === preferredRoom) ? preferredRoom : project.rooms[0]?.id ?? null);
      try {
        this.sceneRooms.set(project.floorplan ? this.scenePlan.rooms(project.floorplan.svg) : []);
      } catch {
        this.sceneError.set('El plano guardado no se pudo interpretar. Puedes reemplazarlo por otro SVG.');
      }
      await this.refreshBudget();
    } catch (error) { if (request === this.request) { this.project.set(null); this.handleError(error); } }
    finally { if (request === this.request) this.projectLoading.set(false); }
  }
  async onProjectFloorplanSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const project = this.project();
    if (!file || !project || this.busy() || this.projectLoading()) return;
    const id = project.id;
    this.sceneError.set('');
    await this.mutate(async () => {
      let svg: string;
      let rooms: SceneRoom[];
      try {
        svg = await readFloorplanFile(file, true);
        rooms = this.scenePlan.rooms(svg);
      } catch (error) {
        if (this.project()?.id === id) this.sceneError.set(error instanceof Error ? error.message : 'No se pudo leer el plano.');
        return;
      }
      if (this.project()?.id !== id) return;
      await this.api.saveProjectFloorplan(id, file.name.slice(0, 180), svg, rooms.map(room => ({
        ...room, areaM2: room.areaM2.toFixed(6),
      })));
      if (this.project()?.id !== id) return;
      await this.router.navigate(['/viewer-3d'], { queryParams: { project: id } });
    });
  }
  newProject(): void { this.editingProjectId.set(undefined); this.projectForm.reset({ name: '', budgetClp: 200000 }); this.showProjectForm.set(true); }
  editProject(): void {
    const project = this.project(); if (!project) return;
    this.editingProjectId.set(project.id); this.projectForm.setValue({ name: project.name, budgetClp: project.budgetClp }); this.showProjectForm.set(true);
  }
  async saveProject(): Promise<void> {
    const data = this.projectForm.getRawValue();
    if (this.projectForm.invalid || !data.name.trim()) { this.error.set('Escribe un nombre y un presupuesto válido en pesos enteros.'); return; }
    await this.mutate(async () => {
      const saved = await this.api.saveProject({ ...data, name: data.name.trim() }, this.editingProjectId());
      await this.reloadProjects();
      await this.openProject(saved.id);
      await this.selectProject(saved.id);
      this.notice.set('Proyecto guardado en tu cuenta.');
    });
  }
  async deleteProject(): Promise<void> {
    const id = this.project()?.id; if (!id) return;
    await this.mutate(async () => { await this.api.deleteProject(id); this.project.set(null); this.budget.set(null); this.confirmDelete.set(null); await this.reloadProjects(); await this.router.navigate([], { relativeTo: this.route, queryParams: {} }); this.notice.set('Proyecto eliminado.'); });
  }
  editRoom(room: ProjectRoom | null): void { this.editingRoom.set(room); this.showRoomForm.set(true); this.confirmDelete.set(null); }
  async saveRoom(data: RoomInput): Promise<void> {
    const project = this.project(); if (!project) return;
    if (data.sceneRoomId && project.rooms.some(room => room.id !== this.editingRoom()?.id && room.sceneRoomId === data.sceneRoomId)) { this.error.set('Ese espacio 3D ya está vinculado a otra habitación del proyecto. Elige uno distinto.'); return; }
    await this.mutate(async () => {
      const revision = data.sceneRoomId ? project.floorplan?.revision : undefined;
      const room = await this.api.saveRoom(project.id, { ...data, floorplanRevision: revision }, this.editingRoom()?.id);
      await this.openProject(project.id, room.id); await this.selectRoom(room.id); this.notice.set('Habitación guardada. El presupuesto se consulta al servidor.');
    });
  }
  async deleteRoom(room: ProjectRoom): Promise<void> {
    const id = this.project()?.id; if (!id) return;
    await this.mutate(async () => { await this.api.deleteRoom(id, room.id); await this.openProject(id); this.notice.set('Habitación eliminada.'); });
  }
  async chooseFloor(publication: Publication | null): Promise<void> {
    const project = this.project(), room = this.selectedRoom(); if (!project || !room) return;
    await this.mutate(async () => {
      await this.api.saveRoom(project.id, { publicationKey: publication?.publicationKey ?? null }, room.id);
      await this.openProject(project.id, room.id);
      this.notice.set(publication ? 'Piso guardado para esta habitación. Abre el visor para ver su apariencia orientativa.' : 'Selección retirada de esta habitación.');
    });
  }
  async toggleSuggestions(project: Project): Promise<void> {
    await this.mutate(async () => {
      const result = await this.api.saveSuggestionsEnabled(project.id, !project.suggestionsEnabled);
      this.project.update(current => current?.id === project.id ? { ...current, suggestionsEnabled: result.suggestionsEnabled } : current);
    });
  }

  saveRoomResult(room: ProjectRoom): void {
    this.project.update(project => project?.id === room.projectId
      ? { ...project, rooms: project.rooms.map(current => current.id === room.id ? room : current) }
      : project);
  }

  async useSuggestedFloor(room: ProjectRoom): Promise<void> {
    this.saveRoomResult(room);
    this.notice.set('Piso guardado para esta habitación. Abre el visor para ver su apariencia orientativa.');
    await this.refreshBudget();
  }

  focusCatalog(): void {
    const target = this.catalogTarget()?.nativeElement;
    target?.focus();
    target?.scrollIntoView({ block: 'start' });
  }

  async refreshBudget(): Promise<void> {
    const id = this.project()?.id; if (!id) return;
    const request = ++this.budgetRequest;
    this.budgetLoading.set(true); this.budgetError.set(''); this.budget.set(null);
    try { const result = await this.api.budget(id); if (request === this.budgetRequest && this.project()?.id === id) this.budget.set(result); }
    catch (error) { if (request === this.budgetRequest && this.project()?.id === id) { this.budgetError.set(apiError(error)); this.handleSessionError(); } }
    finally { if (request === this.budgetRequest && this.project()?.id === id) this.budgetLoading.set(false); }
  }
  private async mutate(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.mutating.set(true); this.error.set(''); this.notice.set('');
    try { await action(); } catch (error) { this.handleError(error); } finally { this.mutating.set(false); }
  }
  private handleError(error: unknown): void { this.error.set(apiError(error)); this.handleSessionError(); }
  private handleSessionError(): void { if (!this.session.user()) { ++this.request; this.project.set(null); this.budget.set(null); this.projects.set([]); } }
}
