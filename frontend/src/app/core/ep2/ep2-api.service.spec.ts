import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Ep2ApiService, chileDate, money } from './ep2-api.service';
import { TEST_BUDGET, TEST_SUGGESTIONS } from './ep2.fixtures';

describe('EP2 API contracts', () => {
  let api: Ep2ApiService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(Ep2ApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('queries the public stored catalog with exactly the agreed filters and no server credential', async () => {
    const result = api.catalog({ source: 'easy', category: 'ceramic', minPricePerM2: '5000.25' }, 2);
    const request = http.expectOne(req => req.url === '/api/materials');
    expect(request.request.params.get('minPricePerM2')).toBe('5000.25');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.headers.has('X-Materials-Token')).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ items: [], total: 0, page: 2, limit: 12 }); await result;
    http.expectNone(req => req.method !== 'GET');
  });
  it('sends exact decimal dimensions to private room CRUD', async () => {
    const data = { name: 'Living', areaMode: 'dimensions' as const, lengthM: '3.123456', widthM: '4.5', wastePercent: '10', budgetClp: null, sceneRoomId: 'scene-test' };
    const result = api.saveRoom(7, data, 'room-test');
    const request = http.expectOne('/api/projects/7/rooms/room-test');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(data);
    expect(request.request.body.areaM2).toBeUndefined();
    request.flush({ id: 'room-test', ...data }); await result;
  });
  it('preserves a pending total from the backend rather than calculating a replacement', async () => {
    const result = api.budget(7);
    http.expectOne('/api/projects/7/budget').flush(TEST_BUDGET);
    expect((await result).total_cost_clp).toBeNull();
    expect(money(null)).toBe('Pendiente');
    expect(money(0)).not.toBe('Pendiente');
    expect(money('7548.91')).toContain('7.548,91');
  });
  it('reads history through NestJS without triggering acquisition', async () => {
    const result = api.history('a'.repeat(64));
    const request = http.expectOne(req => req.url.endsWith('/history'));
    expect(request.request.method).toBe('GET'); request.flush({ items: [], total: 0, page: 1, limit: 20 }); await result;
    http.expectNone('/api/captures');
  });
  it('formats the actual observation in Chilean 24-hour time', () => {
    expect(chileDate('2026-01-01T03:04:00.000Z')).toBe('01/01/2026 00:04');
    expect(chileDate(null)).toBe('Sin comprobación');
  });
  it('queries the room and excludes only those publications discarded in that room', async () => {
    const result = api.suggestions(7, 'room-test', ['first', 'second']);
    const request = http.expectOne(req => req.url === '/api/projects/7/rooms/room-test/suggestions');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.getAll('exclude')).toEqual(['first', 'second']);
    request.flush(TEST_SUGGESTIONS);
    await expect(result).resolves.toEqual(TEST_SUGGESTIONS);
    http.expectNone(req => req.method !== 'GET');
  });
  it('reports a revised quote without making a second acceptance request', async () => {
    const suggestion = TEST_SUGGESTIONS.suggestions[0];
    const result = api.acceptSuggestion(7, 'room-test', suggestion.publicationKey, suggestion.quoteId);
    const request = http.expectOne('/api/projects/7/rooms/room-test/suggestions/accept');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ publicationKey: suggestion.publicationKey, quoteId: suggestion.quoteId });
    const quote = { ...suggestion, totalClp: 85000, quoteId: 'quote-v2' };
    request.flush({ status: 'price_changed', quote }, { status: 409, statusText: 'Conflict' });
    await expect(result).resolves.toEqual({ status: 'price_changed', quote });
  });
});
