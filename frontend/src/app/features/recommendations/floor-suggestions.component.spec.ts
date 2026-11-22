import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ep2ApiService } from '../../core/ep2/ep2-api.service';
import { TEST_PROJECT, TEST_PUBLICATION, TEST_SUGGESTIONS } from '../../core/ep2/ep2.fixtures';
import { SessionService } from '../../core/ep2/session.service';
import { FloorSuggestionsComponent } from './floor-suggestions.component';

describe('Final delivery suggestions', () => {
  let fixture: ComponentFixture<FloorSuggestionsComponent>;
  const api = { suggestions: vi.fn(), acceptSuggestion: vi.fn(), saveFloorPreferences: vi.fn() };
  const room = { ...TEST_PROJECT.rooms[0], preferredCategory: null, preferredSource: null };
  const suggestion = TEST_SUGGESTIONS.suggestions[0];

  beforeEach(async () => {
    vi.resetAllMocks();
    api.suggestions.mockResolvedValue(TEST_SUGGESTIONS);
    TestBed.configureTestingModule({ providers: [
      { provide: Ep2ApiService, useValue: api },
      { provide: SessionService, useValue: { user: signal({ id: 1 }) } },
    ] });
    fixture = TestBed.createComponent(FloorSuggestionsComponent);
    fixture.componentRef.setInput('projectId', TEST_PROJECT.id);
    fixture.componentRef.setInput('room', room);
    await fixture.whenStable();
  });

  it('refreshes with exclusions for the selected room and preserves them across room switches', async () => {
    const replacement = { ...suggestion, publicationKey: 'b'.repeat(64), name: 'Piso de reemplazo' };
    api.suggestions.mockResolvedValueOnce({ ...TEST_SUGGESTIONS, suggestions: [replacement] });
    fixture.componentInstance.dismiss(suggestion);
    await fixture.whenStable();
    expect(api.suggestions).toHaveBeenLastCalledWith(7, room.id, [suggestion.publicationKey]);
    expect(fixture.nativeElement.textContent).toContain('Piso de reemplazo');

    fixture.componentRef.setInput('room', { ...room, id: 'other-room' });
    await fixture.whenStable();
    expect(api.suggestions).toHaveBeenLastCalledWith(7, 'other-room', []);
    expect(fixture.nativeElement.textContent).toContain(suggestion.name);
  });

  it('shows the product photo and keeps the suggestion usable if the image fails', async () => {
    const imageUrl = 'https://media.example.test/piso.jpg';
    api.suggestions.mockResolvedValueOnce({ ...TEST_SUGGESTIONS, suggestions: [{ ...suggestion, imageUrl }] });
    await fixture.componentInstance.refresh();
    await fixture.whenStable();
    const card = fixture.nativeElement.querySelector('.ep2-product') as HTMLElement;
    const image = card.querySelector('img');
    expect(image?.getAttribute('src')).toBe(imageUrl);
    image?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('Foto no disponible');
    expect(card.querySelector('button')?.disabled).toBe(false);
  });

  it('provides a separately labelled suggestions region for the viewer', async () => {
    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();
    const panel = fixture.nativeElement.querySelector('section') as HTMLElement;
    expect(panel.getAttribute('aria-labelledby')).toBe('viewer-suggestions-title');
    expect(panel.querySelector('#viewer-suggestions-title')?.textContent).toContain(room.name);
    expect(panel.textContent).toContain('Aceptar sugerencia');
  });

  it('requires a new explicit acceptance after a price change', async () => {
    const roomAfterSave = { ...room, publicationKey: TEST_PUBLICATION.publicationKey, publication: TEST_PUBLICATION };
    const revised = { ...suggestion, totalClp: 85000, fitsBudget: false, budgetExcessClp: 5000, quoteId: 'quote-v2' };
    api.acceptSuggestion.mockResolvedValueOnce({ status: 'price_changed', quote: revised });
    api.acceptSuggestion.mockResolvedValueOnce({ status: 'accepted', room: roomAfterSave });
    const accepted = vi.fn();
    fixture.componentInstance.floorAccepted.subscribe(accepted);

    await fixture.componentInstance.accept(suggestion);
    await fixture.whenStable();
    expect(api.acceptSuggestion).toHaveBeenCalledExactlyOnceWith(7, room.id, suggestion.publicationKey, 'quote-v1');
    expect(accepted).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Confirma el costo actualizado');
    const confirmation = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Confirmar'));
    expect(confirmation).toBeDefined();
    confirmation?.click();
    await fixture.whenStable();
    expect(api.acceptSuggestion).toHaveBeenLastCalledWith(7, room.id, suggestion.publicationKey, 'quote-v2');
    expect(accepted).toHaveBeenCalledExactlyOnceWith(roomAfterSave);
  });

  it('offers a retry after the recommendation service fails and stops querying when disabled', async () => {
    api.suggestions.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    await fixture.componentInstance.refresh();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('El servicio no está disponible');
    await fixture.componentInstance.refresh();
    expect(fixture.componentInstance.response()).toEqual(TEST_SUGGESTIONS);

    api.suggestions.mockClear();
    fixture.componentRef.setInput('enabled', false);
    await fixture.whenStable();
    expect(api.suggestions).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Las sugerencias están desactivadas');
  });
});
