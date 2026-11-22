import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Viewer3DEngineCallbacks } from './engine/viewer-3d.types';
import { Viewer3DPage } from './viewer-3d.page';
import { VIEWER_ENGINE_FACTORY } from './engine/viewer-engine.factory';
import { Ep2ApiService } from '../../core/ep2/ep2-api.service';
import { SessionService } from '../../core/ep2/session.service';
import type { SceneRoom } from '../../core/ep2/ep2.types';
import { TEST_BUDGET, TEST_PROJECT, TEST_PUBLICATION, TEST_STATUS } from '../../core/ep2/ep2.fixtures';
import { finishForPublication } from './engine/floor-finishes';

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
  it('uses example geometry for saved floors, then restores the free SVG without project materials', async () => {
    ready();
    await component.onFloorplanFileSelected(fileEvent('Mi casa.svg'));
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue({
      ...TEST_PROJECT,
      rooms: [{ ...TEST_PROJECT.rooms[0], publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION }],
    });
    vi.spyOn(api, 'budget').mockResolvedValue(TEST_BUDGET);
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    engine.getSceneRooms.mockImplementationOnce(() => [{ id: 'scene-test', name: 'Ejemplo', areaM2: 12 }]);

    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();

    expect(engine.loadExampleFloorplan).toHaveBeenCalledOnce();
    const exampleLoad = engine.loadExampleFloorplan.mock.invocationCallOrder[0];
    expect(exampleLoad).toBeLessThan(engine.getSceneRooms.mock.invocationCallOrder.at(-1)!);
    expect(exampleLoad).toBeLessThan(engine.setRoomFloorSelections.mock.invocationCallOrder.at(-1)!);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([expect.objectContaining({
      sceneRoomId: 'scene-test', publicationKey: TEST_PUBLICATION.publicationKey, category: 'ceramic',
      finishId: finishForPublication('ceramic', TEST_PUBLICATION.name),
    })]);
    expect(component.modelName()).toBe(TEST_PROJECT.name);

    component.projectMode.set(false);
    await component.loadActiveProject();
    expect(engine.loadFloorplanFromSvgText).toHaveBeenCalledTimes(2);
    expect(engine.loadFloorplanFromSvgText.mock.calls[0]).toEqual(engine.loadFloorplanFromSvgText.mock.calls[1]);
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([]);
    expect(engine.setRoomFloorSelections.mock.invocationCallOrder.at(-1)!).toBeLessThan(engine.loadFloorplanFromSvgText.mock.invocationCallOrder.at(-1)!);
    expect(component.modelName()).toBe('Mi casa');
    expect(component.project()).toBeNull();
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
    vi.spyOn(api, 'project').mockResolvedValue(TEST_PROJECT);
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
    expect(engine.setRoomFloorSelections).toHaveBeenLastCalledWith([expect.objectContaining({ sceneRoomId: 'scene-test', finishId: 'marble' })]);
    expect(component.activeFloorPreview()).toBeUndefined();
    expect(budget).toHaveBeenCalledTimes(2);
  });
  it('uses the scene areas and saves a catalogue floor for a new whole-house project', async () => {
    engine.getSceneRooms.mockReturnValue([{ id: 'selection-a', name: 'Living', areaM2: 8.125 }]);
    ready();
    const api = TestBed.inject(Ep2ApiService);
    TestBed.inject(SessionService).user.set({ id: 1, email: 'demo@example.test' });
    vi.spyOn(api, 'project').mockResolvedValue({ ...TEST_PROJECT, rooms: [] });
    const budget = vi.spyOn(api, 'budget').mockResolvedValue(TEST_BUDGET);
    vi.spyOn(api, 'status').mockResolvedValue(TEST_STATUS);
    component.projectMode.set(true);
    component.projectId.set(TEST_PROJECT.id);
    await component.loadActiveProject();
    const updated = { ...TEST_PROJECT, rooms: [{ ...TEST_PROJECT.rooms[0], sceneRoomId: 'selection-a', publication: TEST_PUBLICATION }] };
    const bulk = vi.spyOn(api, 'saveProjectFloor').mockResolvedValue(updated);
    await component.saveCatalogFloor(TEST_PUBLICATION, true);
    expect(bulk).toHaveBeenCalledWith(TEST_PROJECT.id, TEST_PUBLICATION.publicationKey, [{ id: 'selection-a', name: 'Living', areaM2: '8.125000' }]);
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
