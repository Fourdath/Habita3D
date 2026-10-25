import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { PythonService } from './python.service.js';

const payload = { rooms: [{ room_id: 'r1', area_m2: '10', waste_percent: '10', publication: {
  publication_key: 'p1', source: 'easy', currency: 'CLP', price_per_box_clp: 1000,
  coverage_per_box_m2: '2', checked_at: '2026-10-24T00:00:00Z', availability: 'unknown',
} }] };
const result = { currency: 'CLP', status: 'complete', rooms: [{
  room_id: 'r1', publication_key: 'p1', source: 'easy', currency: 'CLP', price_type: 'public',
  status: 'calculated', reasons: [], area_m2: '10', waste_percent: '10', required_area_m2: '11',
  coverage_per_box_m2: '2', price_per_box_clp: 1000, boxes: 6, purchased_area_m2: '12', cost_clp: 6000,
  budget_clp: null, budget_difference_clp: null, budget_excess_clp: null, fits_budget: null,
  availability: 'unknown', checked_at: '2026-10-24T00:00:00Z', last_check_display: '23/10/2026 21:00',
}], calculated_rooms: 1, uncalculable_rooms: 0, calculable_subtotal_clp: 6000, total_cost_clp: 6000,
  budget_clp: null, budget_difference_clp: null, budget_excess_clp: null, fits_budget: null,
  calculation_basis: 'supplied_publication_snapshots', scope: 'floor_boxes_only' };

describe('Python integration', () => {
  const service = new PythonService();
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('accepts the budget contract and propagates correlation without credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal('fetch', fetch);
    await expect(service.calculateBudget(payload, 'request-1')).resolves.toEqual(result);
    expect(fetch.mock.calls[0][1].headers['X-Request-ID']).toBe('request-1');
    expect(fetch.mock.calls[0][1].headers['X-Materials-Token']).toBeUndefined();
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });

  it.each([
    { ...result, total_cost_clp: 5999 },
    { ...result, budget_clp: 12345 },
    { ...result, rooms: [{ ...result.rooms[0], coverage_per_box_m2: '1' }] },
    { ...result, rooms: [{ ...result.rooms[0], waste_percent: '20' }] },
    { ...result, rooms: [{ ...result.rooms[0], availability: 'available' }] },
    { ...result, rooms: [{ ...result.rooms[0], budget_clp: 100 }] },
    { ...result, rooms: [] },
    { ...result, calculated_rooms: 2 },
    { ...result, rooms: [{ ...result.rooms[0], publication_key: 'another' }] },
    { ...result, rooms: [{ ...result.rooms[0], cost_clp: -1 }] },
    { ...result, rooms: [{ ...result.rooms[0], area_m2: 'NaN' }] },
    { ...result, rooms: [{ ...result.rooms[0], checked_at: 'yesterday' }] },
  ])('rejects invalid or mismatched budgets before exposing them', async (bad) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(bad)));
    await expect(service.calculateBudget(payload)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('does not retry a timeout or source failure', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetch);
    await expect(service.calculateBudget(payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Response('not-json', { headers: { 'content-type': 'application/json' } }),
    new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '3000000' } }),
    new Response('private upstream body', { status: 500 }),
  ])('rejects bad JSON, HTML, oversized responses and failure statuses', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(service.calculateBudget(payload)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('requires a configured operator secret for acquisition', async () => {
    vi.stubEnv('MATERIALS_API_TOKEN', 'replace-your-token-here-please');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(async () => service.capture({})).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).not.toHaveBeenCalled();
  });
});
