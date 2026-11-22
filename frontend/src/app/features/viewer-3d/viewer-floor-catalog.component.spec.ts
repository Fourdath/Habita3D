import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ep2ApiService } from '../../core/ep2/ep2-api.service';
import { TEST_PUBLICATION } from '../../core/ep2/ep2.fixtures';
import type { Page, Publication } from '../../core/ep2/ep2.types';
import { ViewerFloorCatalogComponent } from './viewer-floor-catalog.component';

describe('ViewerFloorCatalogComponent', () => {
  const nextFloor: Publication = { ...TEST_PUBLICATION, publicationKey: 'alternate', name: 'Laminado claro', category: 'laminate' };
  let fixture: ComponentFixture<ViewerFloorCatalogComponent>;
  let component: ViewerFloorCatalogComponent;
  let catalog: ReturnType<typeof vi.fn<Ep2ApiService['catalog']>>;

  beforeEach(() => {
    catalog = vi.fn<Ep2ApiService['catalog']>();
    TestBed.configureTestingModule({ providers: [{ provide: Ep2ApiService, useValue: { catalog } }] });
    fixture = TestBed.createComponent(ViewerFloorCatalogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('roomId', 'living');
    fixture.componentRef.setInput('currentKey', TEST_PUBLICATION.publicationKey);
    fixture.detectChanges();
  });

  function page(items: Publication[], number = 1): Page<Publication> {
    return { items, total: 18, page: number, limit: 12 };
  }

  it('reads stored products after opening and filters out unavailable or unpriced products', async () => {
    catalog.mockResolvedValue(page([TEST_PUBLICATION, { ...nextFloor, availability: 'unavailable' }, { ...nextFloor, coveragePerBoxM2: null }]));
    expect(catalog).not.toHaveBeenCalled();
    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await fixture.whenStable();
    expect(catalog).toHaveBeenCalledExactlyOnceWith({}, 1);
    expect(component.products()).toEqual([TEST_PUBLICATION]);
    expect(component.pageCount()).toBe(2);
  });

  it('emits one explicit change and clears the draft for a different room with the same current floor', async () => {
    const picturedFloor = { ...nextFloor, imageUrl: 'https://media.example.test/laminado.jpg' };
    catalog.mockResolvedValue(page([TEST_PUBLICATION, picturedFloor]));
    await component.load(1);
    fixture.detectChanges();
    const choose = vi.fn();
    component.choose.subscribe(choose);
    component.save();
    const card = fixture.nativeElement.querySelectorAll('.floor-product')[1] as HTMLElement;
    expect(card.querySelector('img')?.getAttribute('src')).toBe(picturedFloor.imageUrl);
    card.querySelector('input')?.click();
    component.save();
    component.save();
    expect(choose).toHaveBeenCalledExactlyOnceWith(picturedFloor);
    fixture.componentRef.setInput('roomId', 'kitchen');
    expect(component.pendingKey()).toBe(TEST_PUBLICATION.publicationKey);
  });

  it('retries the failed page without discarding its previous page until it succeeds', async () => {
    catalog.mockResolvedValueOnce(page([TEST_PUBLICATION]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([nextFloor], 2));
    await component.load(1);
    await component.load(2);
    expect(component.failedPage()).toBe(2);
    expect(component.products()).toEqual([TEST_PUBLICATION]);
    await component.load(component.failedPage()!);
    expect(component.failedPage()).toBeNull();
    expect(component.products()).toEqual([nextFloor]);
    expect(component.pendingKey()).toBeNull();
  });
});
