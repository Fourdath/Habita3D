import { TestBed } from '@angular/core/testing';
import { Ep2ApiService } from '../../core/ep2/ep2-api.service';
import { TEST_BUDGET, TEST_PROJECT, TEST_PUBLICATION, TEST_STATUS } from '../../core/ep2/ep2.fixtures';
import { BudgetPanelComponent } from './budget-panel.component';
import { CatalogPanelComponent } from './catalog-panel.component';
import { RoomEditorComponent } from './room-editor.component';

describe('EP2 explicit UI states', () => {
  it('shows a pending total and no budget verdict for incomplete selections', () => {
    const fixture = TestBed.createComponent(BudgetPanelComponent);
    fixture.componentRef.setInput('budget', TEST_BUDGET); fixture.componentRef.setInput('rooms', TEST_PROJECT.rooms); fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Total pendiente'); expect(text).toContain('Sin piso seleccionado'); expect(text).not.toContain('El proyecto está dentro');
  });
  it('emits decimal dimensions as strings, omits direct area and allows clearing the room limit', () => {
    const fixture = TestBed.createComponent(RoomEditorComponent), save = vi.fn();
    fixture.componentInstance.save.subscribe(save);
    fixture.componentInstance.form.patchValue({ name: 'Living', areaMode: 'dimensions', lengthM: '3,123456', widthM: '4.5', areaM2: 'old-value', wastePercent: '10,5', budgetClp: '' });
    fixture.componentInstance.submit();
    expect(save).toHaveBeenCalledWith({ name: 'Living', areaMode: 'dimensions', lengthM: '3.123456', widthM: '4.5', wastePercent: '10.5', budgetClp: null, sceneRoomId: null });
    fixture.componentInstance.form.controls.wastePercent.setValue('101'); save.mockClear(); fixture.componentInstance.submit();
    expect(save).not.toHaveBeenCalled();
  });
  it('distinguishes a failed global job from an unchanged last successful capture', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: Ep2ApiService, useValue: { catalog: vi.fn().mockResolvedValue({ items: [TEST_PUBLICATION], total: 1, page: 1, limit: 12 }), status: vi.fn().mockResolvedValue({ ...TEST_STATUS, latestJob: { status: 'failed', errorCode: 'python_unavailable' } }) } }] });
    const panel = TestBed.runInInjectionContext(() => new CatalogPanelComponent()); await panel.refresh();
    expect(panel.updateFailed()).toBe(true);
    expect(panel.catalog().items[0].checkedAt).toBe(TEST_PUBLICATION.checkedAt);
    expect(panel.availability('unknown')).toBe('Disponibilidad desconocida');
  });
  it('retains the previous catalog on network errors and never manufactures replacement products', async () => {
    const catalog = vi.fn().mockRejectedValue(new Error('offline'));
    TestBed.configureTestingModule({ providers: [{ provide: Ep2ApiService, useValue: { catalog } }] });
    const panel = TestBed.runInInjectionContext(() => new CatalogPanelComponent());
    panel.catalog.set({ items: [TEST_PUBLICATION], total: 1, page: 1, limit: 12 });
    await panel.loadPage(1);
    expect(panel.catalog().items).toEqual([TEST_PUBLICATION]); expect(panel.error()).toBeTruthy();
  });
  it('rejects reversed price ranges without sending a new catalog request', async () => {
    const catalog = vi.fn(); TestBed.configureTestingModule({ providers: [{ provide: Ep2ApiService, useValue: { catalog } }] });
    const panel = TestBed.runInInjectionContext(() => new CatalogPanelComponent()); panel.filters.patchValue({ minPricePerM2: '10000', maxPricePerM2: '100' });
    await panel.applyFilters(); expect(catalog).not.toHaveBeenCalled(); expect(panel.error()).toContain('mínimo');
    panel.filters.patchValue({ minPricePerM2: '0', maxPricePerM2: '1.001' });
    await panel.applyFilters(); expect(catalog).not.toHaveBeenCalled();
  });
});
