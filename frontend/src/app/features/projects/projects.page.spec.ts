import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { Ep2ApiService } from '../../core/ep2/ep2-api.service';
import { TEST_BUDGET, TEST_PROJECT, TEST_PUBLICATION } from '../../core/ep2/ep2.fixtures';
import { SessionService } from '../../core/ep2/session.service';
import { ScenePlanService } from '../../core/ep2/scene-plan.service';
import { ProjectsPage } from './projects.page';

describe('EP2 project orchestration', () => {
  let page: ProjectsPage;
  const api = { projects: vi.fn(), project: vi.fn(), budget: vi.fn(), saveRoom: vi.fn(), saveProject: vi.fn(), deleteRoom: vi.fn(), deleteProject: vi.fn() };
  const session = { user: signal<{ id: number; email: string } | null>({ id: 1, email: 'synthetic@example.test' }), restore: vi.fn(), authenticate: vi.fn(), logout: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); session.user.set({ id: 1, email: 'synthetic@example.test' });
    api.projects.mockResolvedValue([TEST_PROJECT]); api.project.mockResolvedValue(structuredClone(TEST_PROJECT)); api.budget.mockResolvedValue(TEST_BUDGET); api.saveRoom.mockResolvedValue(TEST_PROJECT.rooms[0]);
    TestBed.configureTestingModule({ providers: [
      { provide: Ep2ApiService, useValue: api }, { provide: SessionService, useValue: session },
      { provide: ScenePlanService, useValue: { rooms: vi.fn().mockResolvedValue([]) } },
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})), snapshot: { queryParams: {} } } },
    ] });
    page = TestBed.runInInjectionContext(() => new ProjectsPage());
    page.project.set(structuredClone(TEST_PROJECT)); page.selectedRoomId.set('room-test');
  });
  it('persists only the publication relation for the chosen room, then requests its backend budget', async () => {
    await page.chooseFloor(TEST_PUBLICATION);
    expect(api.saveRoom).toHaveBeenCalledWith(7, { publicationKey: TEST_PUBLICATION.publicationKey }, 'room-test');
    expect(api.budget).toHaveBeenCalledWith(7);
    expect(page.budget()).toBe(TEST_BUDGET);
  });
  it('rejects duplicate scene mappings before saving', async () => {
    page.project.update(project => ({ ...project!, rooms: [...project!.rooms, { ...project!.rooms[0], id: 'room-two' }] }));
    page.editingRoom.set(TEST_PROJECT.rooms[0]);
    await page.saveRoom({ name: 'Living', areaMode: 'area', areaM2: '10', wastePercent: '10', budgetClp: null, sceneRoomId: 'scene-test' });
    expect(api.saveRoom).not.toHaveBeenCalled();
    expect(page.error()).toContain('otra habitación');
  });
  it('uses a new persisted budget result without deleting room or publication selections', async () => {
    const selected = { ...TEST_PROJECT.rooms[0], publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION };
    page.project.set({ ...TEST_PROJECT, rooms: [selected] });
    const revised = { ...TEST_BUDGET, total_cost_clp: 210000, fits_budget: false, budget_excess_clp: 110000 };
    api.budget.mockResolvedValue(revised);
    await page.refreshBudget();
    expect(page.budget()).toBe(revised);
    expect(page.project()?.rooms[0].publicationKey).toBe(TEST_PUBLICATION.publicationKey);
    expect(api.saveRoom).not.toHaveBeenCalled();
  });
  it('does not replace a failed budget request with demonstration prices or zero', async () => {
    api.budget.mockRejectedValueOnce(new Error('offline'));
    await page.refreshBudget();
    expect(page.budget()).toBeNull(); expect(page.budgetError()).toBeTruthy();
  });
  it('restores the room selected in the URL when loading a project', async () => {
    const room = { ...TEST_PROJECT.rooms[0], id: 'room-two', name: 'Segunda habitación' };
    api.project.mockResolvedValue({ ...TEST_PROJECT, rooms: [...TEST_PROJECT.rooms, room] });
    await page.openProject(7, room.id);
    expect(page.selectedRoom()?.id).toBe(room.id);
  });
});
