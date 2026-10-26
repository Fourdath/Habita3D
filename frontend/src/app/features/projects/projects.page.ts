import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Ep2ApiService, apiError, money } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import { ScenePlanService } from '../../core/ep2/scene-plan.service';
import type { Project, ProjectBudget, ProjectRoom, ProjectSummary, Publication, RoomInput, SceneRoom } from '../../core/ep2/ep2.types';
import { BrandMarkComponent } from '../landing/components/brand-mark.component';
import { BudgetPanelComponent } from './budget-panel.component';
import { CatalogPanelComponent } from './catalog-panel.component';
import { RoomEditorComponent } from './room-editor.component';

@Component({
  selector: 'app-projects', templateUrl: 'projects.page.html', styleUrls: ['projects.page.scss'],
  imports: [IonContent, RouterLink, ReactiveFormsModule, BrandMarkComponent, BudgetPanelComponent, CatalogPanelComponent, RoomEditorComponent],
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
  readonly selectedRoomId = signal<string | null>(null);
  readonly selectedRoom = computed(() => this.project()?.rooms.find(room => room.id === this.selectedRoomId()) ?? null);
  readonly loading = signal(true);
  readonly projectLoading = signal(false);
  readonly budgetLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly budgetError = signal('');
  readonly sceneError = signal('');
  readonly notice = signal('');
  readonly authMode = signal<'login' | 'register'>('login');
  readonly showProjectForm = signal(false);
  readonly editingProjectId = signal<number | undefined>(undefined);
  readonly showRoomForm = signal(false);
  readonly editingRoom = signal<ProjectRoom | null>(null);
  readonly confirmDelete = signal<string | null>(null);
  readonly money = money;
  private initialized = false;
  private request = 0;
  private requestedProject: number | null = null;
  private requestedRoom: string | null = null;
  readonly authForm = new FormGroup({ email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] }), password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12), Validators.maxLength(128)] }) });
  readonly projectForm = new FormGroup({ name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }), budgetClp: new FormControl(200000, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(1e15), Validators.pattern(/^\d+$/)] }) });

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const raw = params.get('project');
      this.requestedProject = raw && /^[1-9]\d*$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null;
      this.requestedRoom = params.get('room');
      if (this.initialized && this.session.user()) {
        if (this.requestedProject !== this.project()?.id) void this.openProject(this.requestedProject);
        else this.selectedRoomId.set(this.project()?.rooms.some(room => room.id === this.requestedRoom) ? this.requestedRoom : this.project()?.rooms[0]?.id ?? null);
      }
    });
    void this.initialize();
  }

  async initialize(): Promise<void> {
    this.error.set(''); this.loading.set(true);
    try {
      await this.session.restore();
      if (this.session.user()) { await this.reloadProjects(); await this.openProject(this.requestedProject); }
    } catch (error) { this.handleError(error); }
    finally { this.initialized = true; this.loading.set(false); }
    try { this.sceneRooms.set(await this.scenePlan.rooms()); }
    catch { this.sceneError.set('No se pudo leer el plano de ejemplo. Puedes guardar habitaciones sin vincularlas y volver a intentar al abrir el visor.'); }
  }
  async authenticate(): Promise<void> {
    if (this.authForm.invalid) { this.error.set('Usa un correo válido y una contraseña de 12 a 128 caracteres.'); return; }
    await this.mutate(async () => {
      const { email, password } = this.authForm.getRawValue();
      await this.session.authenticate(this.authMode(), email, password);
      this.authForm.controls.password.reset();
      await this.reloadProjects(); await this.openProject(this.requestedProject);
    });
  }
  async logout(): Promise<void> {
    await this.mutate(async () => {
      try { await this.session.logout(); } finally { ++this.request; this.project.set(null); this.budget.set(null); this.projects.set([]); this.showProjectForm.set(false); this.showRoomForm.set(false); }
    });
  }
  private async reloadProjects(): Promise<void> { this.projects.set(await this.api.projects()); }
  async selectProject(id: number): Promise<void> { await this.router.navigate([], { relativeTo: this.route, queryParams: { project: id } }); }
  async selectRoom(id: string): Promise<void> {
    this.selectedRoomId.set(id); this.showRoomForm.set(false); this.confirmDelete.set(null);
    await this.router.navigate([], { relativeTo: this.route, queryParams: { project: this.project()?.id, room: id }, replaceUrl: true });
  }
  async openProject(id: number | null, preferredRoom = this.requestedRoom): Promise<void> {
    const request = ++this.request;
    if (this.project()?.id !== id) this.project.set(null);
    this.budget.set(null); this.showRoomForm.set(false); this.showProjectForm.set(false); this.confirmDelete.set(null);
    this.budgetLoading.set(false); this.projectLoading.set(false);
    if (id === null) return;
    this.projectLoading.set(true);
    try {
      const project = await this.api.project(id);
      if (request !== this.request) return;
      this.project.set(project);
      this.selectedRoomId.set(project.rooms.some(room => room.id === preferredRoom) ? preferredRoom : project.rooms[0]?.id ?? null);
      await this.refreshBudget();
    } catch (error) { if (request === this.request) { this.project.set(null); this.handleError(error); } }
    finally { if (request === this.request) this.projectLoading.set(false); }
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
      const room = await this.api.saveRoom(project.id, data, this.editingRoom()?.id);
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
  async refreshBudget(): Promise<void> {
    const id = this.project()?.id; if (!id) return;
    this.budgetLoading.set(true); this.budgetError.set(''); this.budget.set(null);
    try { const result = await this.api.budget(id); if (this.project()?.id === id) this.budget.set(result); }
    catch (error) { if (this.project()?.id === id) { this.budgetError.set(apiError(error)); this.handleSessionError(); } }
    finally { if (this.project()?.id === id) this.budgetLoading.set(false); }
  }
  private async mutate(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await action(); } catch (error) { this.handleError(error); } finally { this.busy.set(false); }
  }
  private handleError(error: unknown): void { this.error.set(apiError(error)); this.handleSessionError(); }
  private handleSessionError(): void { if (!this.session.user()) { ++this.request; this.project.set(null); this.budget.set(null); this.projects.set([]); } }
}
