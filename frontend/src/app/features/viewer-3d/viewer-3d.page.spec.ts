import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Viewer3DEngineCallbacks } from './engine/viewer-3d.types';
import { Viewer3DPage } from './viewer-3d.page';
import { VIEWER_ENGINE_FACTORY } from './engine/viewer-engine.factory';
import { Ep2ApiService } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import type { SceneRoom } from '../../core/ep2/ep2.types';
import { TEST_BUDGET, TEST_PROJECT, TEST_PUBLICATION, TEST_STATUS, TEST_SUGGESTIONS } from '../../core/ep2/ep2.fixtures';

const uploaded = {
  name: 'Proyecto.svg',
  svg: '<svg xmlns="http://www.w3.org/2000/svg"><g class="Wall"><polygon points="0,0 15,0 15,2 0,2"/></g></svg>',
  revision: '216a38f6-4173-498f-a7b9-e29c65ae6bb6',
};

const engine = {
  fail: false,
  callbacks: {} as Viewer3DEngineCallbacks,
  setViewMode: vi.fn(), frameOverview: vi.fn(), zoomOverview: vi.fn(), requestPointerLock: vi.fn(),
  setTouchWalkEnabled: vi.fn(), setTouchDirection: vi.fn(), loadExampleFloorplan: vi.fn(),
  loadFloorplanFromSvgText: vi.fn(), applyInteriorStyle: vi.fn(), dispose: vi.fn(),
  getSceneRooms: vi.fn((): SceneRoom[] => []), setRoomFloorSelections: vi.fn().mockResolvedValue(undefined),
  setSelectedSceneRoom: vi.fn(), setInteriorWallColors: vi.fn(), setConstructionView: vi.fn(),
};

describe('Viewer3DPage', () => {
  let component: Viewer3DPage;
  let fixture: ComponentFixture<Viewer3DPage>;
  beforeEach(() => {
    vi.clearAllMocks();
    engine.fail = false;
    engine.getSceneRooms.mockReset().mockReturnValue([]);
    engine.loadFloorplanFromSvgText.mockResolvedValue(undefined);
    engine.applyInteriorStyle.mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), {
      provide: VIEWER_ENGINE_FACTORY,
      useValue: (_container: HTMLElement, callbacks: Viewer3DEngineCallbacks) => {
        if (engine.fail) throw new Error('WebGL no disponible');
        engine.callbacks = callbacks;
        return {
          ...engine,
          getBudget: () => ({ styleId: 'none', isDemoPricing: true, items: [], totalClp: 0, requiresStructuralSpecification: false }),
          getModelSummary: () => ({ roomCount: 6, areaM2: 84.5 }),
        };
      },
    }] });
    fixture = TestBed.createComponent(Viewer3DPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  function ready(): HTMLElement {
    engine.callbacks.onReady?.();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  function button(label: string): HTMLButtonElement {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((node) => node.textContent?.trim() === label)!;
  }
  function fileEvent(name: string, contents = '<svg xmlns="http://www.w3.org/2000/svg"><g class="Wall"><polygon points="0,0 10,0 10,2 0,2"/></g></svg>'): Event {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [new File([contents], name, { type: 'image/svg+xml' })] });
    return { target: input } as unknown as Event;
  }
  it('opens on an inspectable overview without starting a walkthrough', () => {
    const host = ready();
    expect(component.viewMode()).toBe('overview');
    expect(host.querySelector('.studio__sidebar')).not.toBeNull();
    expect(host.querySelector('.viewer-3d__pause')).toBeNull();
    expect(button('Vista general').getAttribute('aria-pressed')).toBe('true');
    expect(button('Recorrer la casa →').disabled).toBe(false);
    expect(engine.requestPointerLock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('84.5');
  });
  it('restores the requested room in the asynchronous select and hides EP1 demo costs for a private project', () => {
    component.status.set('ready');
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    component.projectRoomId.set('second-room');
    component.interiorStyleId.set('nordic');
    component.project.set({ ...TEST_PROJECT, rooms: [...TEST_PROJECT.rooms, { ...TEST_PROJECT.rooms[0], id: 'second-room', name: 'Segunda habitación', publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION }] });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLSelectElement>('#project-room')?.value).toBe('second-room');
    expect(host.textContent).toContain(TEST_PUBLICATION.name);
    expect(host.textContent).not.toContain('Ver presupuesto estimado');
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('previews a catalogue floor from a direct link without changing saved rooms or budget', async () => {
    const api = TestBed.inject(Ep2ApiService);
    const router = TestBed.inject(Router);
    const storedRoom = { ...TEST_PROJECT.rooms[0], sceneRoomId: 'scene-a', publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION };
    const otherRoom = { ...storedRoom, id: 'other-room', sceneRoomId: 'scene-b' };
    const project = { ...TEST_PROJECT, rooms: [storedRoom, otherRoom], floorplan: uploaded };
    const alternative = { ...TEST_PUBLICATION, publicationKey: 'b'.repeat(64), name: 'Laminado de prueba', category: 'laminate' as const };
    TestBed.inject(SessionService).user.set({ id: 1, email: 'operator@example.test' });
    engine.getSceneRooms.mockReturnValue([
      { id: 'scene-a', name: 'Recinto A', areaM2: 10 },
      { id: 'scene-b', name: 'Recinto B', areaM2: 14 },
    ]);
    vi.spyOn(api, 'project').mockResolvedValue(project);
    vi.spyOn(api, 'budget').mockResolvedValue(TEST_BUDGET);
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    vi.spyOn(api, 'suggestions').mockResolvedValue(TEST_SUGGESTIONS);
    const getProduct = vi.spyOn(api, 'publication').mockResolvedValue(alternative);
    const saveRoom = vi.spyOn(api, 'saveRoom');
    const acceptSuggestion = vi.spyOn(api, 'acceptSuggestion');
    await router.navigateByUrl(`/?project=${project.id}&room=${storedRoom.id}&preview=${alternative.publicationKey}`);
    ready();
    await vi.waitFor(() => expect(component.suggestedFloorPreview()?.publication).toBe(alternative));
    expect(getProduct).toHaveBeenCalledWith(alternative.publicationKey);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([
      expect.objectContaining({ sceneRoomId: 'scene-a', publicationKey: alternative.publicationKey, category: 'laminate' }),
      expect.objectContaining({ sceneRoomId: 'scene-b', publicationKey: TEST_PUBLICATION.publicationKey }),
    ]);
    expect(component.project()?.rooms[0].publicationKey).toBe(TEST_PUBLICATION.publicationKey);
    expect(component.projectBudget()).toBe(TEST_BUDGET);
    expect(saveRoom).not.toHaveBeenCalled();
    expect(acceptSuggestion).not.toHaveBeenCalled();
    await component.closeFloorPreview();
    await vi.waitFor(() => expect(component.suggestedFloorPreview()).toBeNull());
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([
      expect.objectContaining({ sceneRoomId: 'scene-a', publicationKey: TEST_PUBLICATION.publicationKey }),
      expect.objectContaining({ sceneRoomId: 'scene-b', publicationKey: TEST_PUBLICATION.publicationKey }),
    ]);
  });
  it('enters the existing walkthrough only after an explicit action and returns to overview', () => {
    ready();
    Object.defineProperty(component, 'pointerLockSupported', { value: true });
    button('Recorrer la casa →').click();
    fixture.detectChanges();
    expect(engine.setViewMode).toHaveBeenCalledWith('walk');
    expect(engine.requestPointerLock).toHaveBeenCalledOnce();
    expect(component.viewMode()).toBe('walk');
    expect((fixture.nativeElement as HTMLElement).querySelector('.viewer-3d__pause')).not.toBeNull();
    engine.callbacks.onPointerLockChange?.(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.viewer-3d__pause')).toBeNull();
    engine.callbacks.onPointerLockChange?.(false);
    fixture.detectChanges();
    button('Volver a la vista general').click();
    fixture.detectChanges();
    expect(component.viewMode()).toBe('overview');
    expect(engine.setViewMode).toHaveBeenLastCalledWith('overview');
    expect((fixture.nativeElement as HTMLElement).querySelector('.studio__sidebar')).not.toBeNull();
  });
  it('provides top view, perspective, centering and zoom controls', () => {
    const host = ready();
    button('Desde arriba').click();
    fixture.detectChanges();
    expect(component.topView()).toBe(true);
    expect(engine.frameOverview).toHaveBeenLastCalledWith(true);
    host.querySelector<HTMLButtonElement>('[aria-label="Acercar"]')!.click();
    expect(engine.zoomOverview).toHaveBeenCalledWith(.8);
    host.querySelector<HTMLButtonElement>('[aria-label="Alejar"]')!.click();
    expect(engine.zoomOverview).toHaveBeenCalledWith(1.25);
    button('Vista general').click();
    expect(engine.frameOverview).toHaveBeenLastCalledWith(false);
  });
  it('offers touch movement without requiring pointer lock and returns to the overview', () => {
    const host = ready();
    Object.defineProperty(component, 'touchSupported', { value: true });
    Object.defineProperty(component, 'pointerLockSupported', { value: false });
    button('Recorrer la casa →').click();
    fixture.detectChanges();
    expect(host.querySelector('.viewer-3d__pause')).toBeNull();
    expect(engine.setTouchWalkEnabled).toHaveBeenCalledWith(true);
    expect(engine.requestPointerLock).not.toHaveBeenCalled();
    const forward = host.querySelector<HTMLButtonElement>('[aria-label="Avanzar"]')!;
    forward.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    forward.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    expect(engine.setTouchDirection.mock.calls).toEqual([['forward', true], ['forward', false]]);
    button('Vista general').click();
    expect(component.touchWalk()).toBe(false);
    expect(engine.setViewMode).toHaveBeenLastCalledWith('overview');
  });
  it('does not allow entering while the model or finishes are loading', () => {
    ready();
    Object.defineProperty(component, 'pointerLockSupported', { value: true });
    component.loadingFloorplan.set(true);
    fixture.detectChanges();
    expect(button('Recorrer la casa →').disabled).toBe(true);
    component.onStartClick();
    expect(engine.requestPointerLock).not.toHaveBeenCalled();
  });
  it('reopens the overview when Ionic retains a previous walkthrough page', () => {
    ready();
    component.onViewModeChange('walk');
    component.ionViewWillLeave();
    component.ionViewWillEnter();
    expect(component.viewMode()).toBe('overview');
    expect(engine.setViewMode).toHaveBeenLastCalledWith('overview');
  });
  it('explains a refused mouse capture and allows returning to the model', () => {
    ready();
    component.onViewModeChange('walk');
    engine.callbacks.onPointerLockError?.();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('El navegador');
    button('Volver a la vista general').click();
    expect(component.viewMode()).toBe('overview');
  });
  it('rejects invalid files without replacing the current model', async () => {
    ready();
    await component.onFloorplanFileSelected(fileEvent('plano.png'));
    expect(component.floorplanError()).toContain('.svg');
    expect(engine.loadFloorplanFromSvgText).not.toHaveBeenCalled();
    expect(component.modelName()).toBe('Vivienda de demostración');
    expect(component.loadingFloorplan()).toBe(false);
  });
  it('loads a selected plan into overview and refreshes its summary', async () => {
    ready();
    component.onViewModeChange('walk');
    await component.onFloorplanFileSelected(fileEvent('Mi casa.svg'));
    expect(engine.loadFloorplanFromSvgText).toHaveBeenCalledOnce();
    expect(component.modelName()).toBe('Mi casa');
    expect(component.viewMode()).toBe('overview');
    expect(component.modelSummary().roomCount).toBe(6);
    expect(component.floorplanError()).toBeNull();
  });
  it('keeps the current plan and name when engine validation fails', async () => {
    ready();
    engine.loadFloorplanFromSvgText.mockRejectedValueOnce(new Error('El plano no tiene muros.'));
    await component.onFloorplanFileSelected(fileEvent('invalido.svg'));
    expect(component.modelName()).toBe('Vivienda de demostración');
    expect(component.floorplanError()).toBe('El plano no tiene muros.');
    expect(component.loadingFloorplan()).toBe(false);
  });
  it('loads the saved drawing before its floors and restores the separate free SVG', async () => {
    ready();
    await component.onFloorplanFileSelected(fileEvent('Mi casa.svg'));
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue({
      ...TEST_PROJECT,
      floorplan: uploaded,
      rooms: [{ ...TEST_PROJECT.rooms[0], publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION }],
    });
    vi.spyOn(api, 'budget').mockResolvedValue(TEST_BUDGET);
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    engine.getSceneRooms.mockImplementationOnce(() => [{ id: 'scene-test', name: 'Ejemplo', areaM2: 12 }]);

    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();

    expect(engine.loadExampleFloorplan).not.toHaveBeenCalled();
    expect(engine.loadFloorplanFromSvgText).toHaveBeenLastCalledWith(uploaded.svg);
    const projectLoad = engine.loadFloorplanFromSvgText.mock.invocationCallOrder.at(-1)!;
    expect(projectLoad).toBeLessThan(engine.getSceneRooms.mock.invocationCallOrder.at(-1)!);
    expect(projectLoad).toBeLessThan(engine.setRoomFloorSelections.mock.invocationCallOrder.at(-1)!);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([expect.objectContaining({
      sceneRoomId: 'scene-test', publicationKey: TEST_PUBLICATION.publicationKey, category: 'ceramic',
      publicationName: TEST_PUBLICATION.name,
    })]);
    expect(component.modelName()).toBe(TEST_PROJECT.name);

    component.projectMode.set(false);
    await component.loadActiveProject();
    expect(engine.loadFloorplanFromSvgText).toHaveBeenCalledTimes(3);
    expect(engine.loadFloorplanFromSvgText.mock.calls[0]).toEqual(engine.loadFloorplanFromSvgText.mock.calls[2]);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([]);
    expect(component.modelName()).toBe('Mi casa');
    expect(component.project()).toBeNull();
  });
  it('asks for a drawing when a project has no saved floor plan', async () => {
    ready();
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue(TEST_PROJECT);
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();
    fixture.detectChanges();
    expect(engine.loadExampleFloorplan).not.toHaveBeenCalled();
    expect(component.modelReady()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Ir al proyecto y cargar el plano');
  });
  it('ignores a project response received after returning to the free viewer', async () => {
    ready();
    await component.onFloorplanFileSelected(fileEvent('Mi casa.svg'));
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    let markStarted!: () => void;
    let respond!: (project: typeof TEST_PROJECT) => void;
    const requestStarted = new Promise<void>(resolve => { markStarted = resolve; });
    const projectResponse = new Promise<typeof TEST_PROJECT>(resolve => { respond = resolve; });
    vi.spyOn(TestBed.inject(Ep2ApiService), 'project').mockImplementation(() => {
      markStarted();
      return projectResponse;
    });
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    const loading = component.loadActiveProject();
    await requestStarted;

    component.projectMode.set(false);
    await component.loadActiveProject();
    const sceneReads = engine.getSceneRooms.mock.calls.length;
    respond(TEST_PROJECT);
    await loading;
    expect(component.modelName()).toBe('Mi casa');
    expect(component.project()).toBeNull();
    expect(engine.getSceneRooms).toHaveBeenCalledTimes(sceneReads);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([]);
  });
  it('applies floor design and color independently in each free room and resets only the active room', async () => {
    engine.getSceneRooms.mockReturnValue([
      { id: 'living', name: 'Living', areaM2: 12 }, { id: 'kitchen', name: 'Cocina', areaM2: 8 },
    ]);
    ready();
    await component.changeFloorFinish('marble');
    await component.changeFloorTint('#aab5c2');
    component.selectAppearanceRoom('kitchen');
    await component.changeFloorFinish('terracotta');
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([
      { sceneRoomId: 'living', finishId: 'marble', tint: '#aab5c2' }, { sceneRoomId: 'kitchen', finishId: 'terracotta' },
    ]);
    await component.resetFloorAppearance();
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([{ sceneRoomId: 'living', finishId: 'marble', tint: '#aab5c2' }]);
    component.selectAppearanceRoom('living');
    expect(component.activeFloorPreview()?.tint).toBe('#aab5c2');
  });
  it('selects a room from the scene and applies color by room or to the whole interior', () => {
    engine.getSceneRooms.mockReturnValue([
      { id: 'living', name: 'Living', areaM2: 12 }, { id: 'kitchen', name: 'Cocina', areaM2: 8 },
    ]);
    ready();
    engine.callbacks.onRoomPick?.('kitchen');
    fixture.detectChanges();
    expect(component.appearanceRoomId()).toBe('kitchen');
    expect(engine.setSelectedSceneRoom).toHaveBeenLastCalledWith('kitchen');
    component.paintInterior('all', '#dfcdb0');
    component.paintInterior('room', '#829b90');
    fixture.detectChanges();
    expect(engine.setInteriorWallColors).toHaveBeenLastCalledWith({ all: '#dfcdb0', rooms: new Map([['kitchen', '#829b90']]) });
    component.toggleConstructionView();
    engine.callbacks.onRoomPick?.('living');
    expect(component.appearanceRoomId()).toBe('kitchen');
    component.onFrameOverview(true);
    expect(engine.setConstructionView.mock.calls).toEqual([[true], [false]]);
  });
  it('saves a different catalogue floor from the project viewer and refreshes its budget', async () => {
    engine.getSceneRooms.mockReturnValue([{ id: 'scene-test', name: 'Living', areaM2: 12 }]);
    ready();
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue({ ...TEST_PROJECT, floorplan: uploaded });
    const budget = vi.spyOn(api, 'budget').mockResolvedValue(TEST_BUDGET);
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();

    const publication = { ...TEST_PUBLICATION, name: 'Cerámica Carrara', publicationKey: 'b'.repeat(64) };
    const room = { ...TEST_PROJECT.rooms[0], publicationKey: publication.publicationKey, publication };
    const save = vi.spyOn(api, 'saveRoom').mockResolvedValue(room);
    await component.changeFloorFinish('terracotta');
    expect(save).not.toHaveBeenCalled();
    await component.saveCatalogFloor(publication);
    expect(save).toHaveBeenCalledWith(TEST_PROJECT.id, { publicationKey: publication.publicationKey }, room.id);
    expect(component.selectedProjectRoom()?.publicationKey).toBe(publication.publicationKey);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([expect.objectContaining({
      sceneRoomId: 'scene-test', publicationName: publication.name,
    })]);
    expect(component.activeFloorPreview()).toBeUndefined();
    expect(budget).toHaveBeenCalledTimes(2);
  });
  it('accepts the quoted floor of the current room and refreshes the 3D floor and budget below suggestions', async () => {
    engine.getSceneRooms.mockReturnValue([{ id: 'scene-test', name: 'Living', areaM2: 12 }]);
    ready();
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue({ ...TEST_PROJECT, floorplan: uploaded });
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    const room = { ...TEST_PROJECT.rooms[0], publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION };
    const budget = vi.spyOn(api, 'budget').mockResolvedValueOnce(TEST_BUDGET)
      .mockResolvedValue({
        ...TEST_BUDGET, status: 'complete', total_cost_clp: 60000, calculable_subtotal_clp: 60000,
        rooms: [{
          room_id: room.id, publication_key: room.publicationKey, status: 'calculated', reasons: [],
          area_m2: '10.25', waste_percent: '10', required_area_m2: '11.275', coverage_per_box_m2: '2',
          price_per_box_clp: 10000, boxes: 6, purchased_area_m2: '12', cost_clp: 60000,
          budget_clp: null, budget_excess_clp: null, fits_budget: null, checked_at: TEST_PUBLICATION.checkedAt,
          last_check_display: TEST_PUBLICATION.lastCheckedDisplay,
        }],
      });
    const suggest = vi.spyOn(api, 'suggestions').mockResolvedValue({
      ...TEST_SUGGESTIONS, suggestions: [{ ...TEST_SUGGESTIONS.suggestions[0], boxes: 6, totalClp: 60000 }],
    });
    const accept = vi.spyOn(api, 'acceptSuggestion').mockResolvedValue({ status: 'accepted', room });
    const save = vi.spyOn(api, 'saveRoom');
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const suggestions = host.querySelector('app-floor-suggestions')!;
    const roomBudget = host.querySelector('.studio__room-budget')!;
    const catalog = host.querySelector('app-viewer-floor-catalog')!;
    expect(suggestions.compareDocumentPosition(roomBudget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(roomBudget.compareDocumentPosition(catalog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(suggest).toHaveBeenCalledWith(TEST_PROJECT.id, room.id, []);
    button('Aceptar sugerencia').click();
    await fixture.whenStable();

    expect(accept).toHaveBeenCalledExactlyOnceWith(TEST_PROJECT.id, room.id, room.publicationKey, 'quote-v1');
    expect(save).not.toHaveBeenCalled();
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([
      expect.objectContaining({ sceneRoomId: room.sceneRoomId, publicationKey: room.publicationKey }),
    ]);
    expect(budget).toHaveBeenCalledTimes(2);
    expect(roomBudget.textContent).toContain('Piso guardado en Habitación de prueba.');
    expect(roomBudget.querySelector('p strong')?.textContent).toMatch(/6 cajas.*60\.000/);
  });
  it('uses the scene areas and saves a catalogue floor for a new whole-house project', async () => {
    engine.getSceneRooms.mockReturnValue([{ id: 'selection-a', name: 'Living', areaM2: 8.125 }]);
    ready();
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue({ ...TEST_PROJECT, rooms: [], floorplan: uploaded });
    const budget = vi.spyOn(api, 'budget').mockResolvedValue(TEST_BUDGET);
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();
    const updated = { ...TEST_PROJECT, rooms: [{ ...TEST_PROJECT.rooms[0], sceneRoomId: 'selection-a', publication: TEST_PUBLICATION }] };
    const bulk = vi.spyOn(api, 'saveProjectFloor').mockResolvedValue(updated);
    await component.saveCatalogFloor(TEST_PUBLICATION, true);
    expect(bulk).toHaveBeenCalledWith(TEST_PROJECT.id, TEST_PUBLICATION.publicationKey, [{ id: 'selection-a', name: 'Living', areaM2: '8.125000' }], uploaded.revision);
    expect(component.project()).toEqual(updated);
    expect(budget).toHaveBeenCalledTimes(2);
  });
  it('preserves a chosen finish when moving between overview and walkthrough', async () => {
    ready();
    await component.onInteriorStyleChange('nordic');
    component.onViewModeChange('walk');
    component.onViewModeChange('overview');
    expect(component.interiorStyleId()).toBe('nordic');
    expect(engine.applyInteriorStyle).toHaveBeenCalledExactlyOnceWith('nordic');
    expect(component.interiorStyleLoading()).toBe(false);
  });
  it('shows a recoverable error if WebGL cannot start', () => {
    fixture.destroy();
    engine.fail = true;
    fixture = TestBed.createComponent(Viewer3DPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('error');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('WebGL no disponible');
  });
  it('disposes the engine when the viewer is destroyed', () => {
    fixture.destroy();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
});
