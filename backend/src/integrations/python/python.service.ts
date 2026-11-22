import { randomUUID } from 'node:crypto';

import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface FloorRoomResponse {
  room_id: string;
  publication_key: string;
  source: 'sodimac' | 'easy';
  currency: 'CLP';
  price_type: 'public';
  status: 'calculated' | 'uncalculable';
  reasons: ('missing_price' | 'missing_coverage')[];
  area_m2: string;
  waste_percent: string;
  required_area_m2: string | null;
  coverage_per_box_m2: string | null;
  price_per_box_clp: number | null;
  boxes: number | null;
  purchased_area_m2: string | null;
  cost_clp: number | null;
  budget_clp: number | null;
  budget_difference_clp: number | null;
  budget_excess_clp: number | null;
  fits_budget: boolean | null;
  availability: 'available' | 'unavailable' | 'unknown';
  checked_at: string;
  last_check_display: string;
}

export interface FloorBudgetResponse {
  currency: 'CLP';
  status: 'complete' | 'partial' | 'uncalculable';
  rooms: FloorRoomResponse[];
  calculated_rooms: number;
  uncalculable_rooms: number;
  calculable_subtotal_clp: number;
  total_cost_clp: number | null;
  budget_clp: number | null;
  budget_difference_clp: number | null;
  budget_excess_clp: number | null;
  fits_budget: boolean | null;
  calculation_basis: 'supplied_publication_snapshots';
  scope: 'floor_boxes_only';
}

export interface FloorSuggestionsResponse {
  rule_version: 'floor-rules-v1';
  status: 'within_budget' | 'over_budget' | 'no_candidates';
  items: {
    publication_key: string;
    boxes: number;
    cost_clp: number;
    budget_excess_clp: number;
    reasons: string[];
  }[];
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const decimal = (v: unknown): v is string => typeof v === 'string'
  && /^\d{1,30}(?:\.\d{1,20})?$/.test(v);
const whole = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const signedWhole = (v: unknown): v is number => Number.isSafeInteger(v);
const oneOf = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v);
const nullable = (v: unknown, predicate: (x: unknown) => boolean) => v === null || predicate(v);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const dateWithZone = (v: unknown) => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

function decimalEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) => {
    const parts = String(value).split('.');
    return `${parts[0].replace(/^0+(?=\d)/, '')}.${(parts[1] ?? '').replace(/0+$/, '')}`;
  };
  return (typeof left === 'string' || typeof left === 'number')
    && (typeof right === 'string' || typeof right === 'number') && canonical(left) === canonical(right);
}

function isRoom(value: unknown): value is FloorRoomResponse {
  if (!record(value)) return false;
  const r = value;
  return typeof r.room_id === 'string' && typeof r.publication_key === 'string'
    && oneOf(r.source, ['sodimac', 'easy']) && r.currency === 'CLP' && r.price_type === 'public'
    && oneOf(r.status, ['calculated', 'uncalculable'])
    && Array.isArray(r.reasons) && r.reasons.every(v => oneOf(v, ['missing_price', 'missing_coverage']))
    && decimal(r.area_m2) && decimal(r.waste_percent)
    && ['required_area_m2', 'coverage_per_box_m2', 'purchased_area_m2'].every(k => nullable(r[k], decimal))
    && ['price_per_box_clp', 'boxes', 'cost_clp', 'budget_clp', 'budget_excess_clp'].every(k => nullable(r[k], whole))
    && nullable(r.budget_difference_clp, signedWhole) && nullable(r.fits_budget, v => typeof v === 'boolean')
    && oneOf(r.availability, ['available', 'unavailable', 'unknown'])
    && dateWithZone(r.checked_at) && typeof r.last_check_display === 'string'
    && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(r.last_check_display)
    && (r.status === 'calculated'
      ? r.reasons.length === 0 && whole(r.cost_clp) && whole(r.boxes) && Number(r.boxes) > 0
        && decimal(r.required_area_m2) && decimal(r.purchased_area_m2)
        && decimal(r.coverage_per_box_m2) && whole(r.price_per_box_clp)
      : r.reasons.length > 0 && r.cost_clp === null && r.boxes === null);
}

export function isFloorBudgetResponse(value: unknown, payload: unknown): value is FloorBudgetResponse {
  if (!record(value) || !record(payload) || !Array.isArray(payload.rooms)) return false;
  const v = value;
  if (v.currency !== 'CLP' || v.scope !== 'floor_boxes_only'
      || v.calculation_basis !== 'supplied_publication_snapshots'
      || !oneOf(v.status, ['complete', 'partial', 'uncalculable'])
      || !Array.isArray(v.rooms) || v.rooms.length !== payload.rooms.length || v.rooms.length > 100
      || !v.rooms.every(isRoom) || !whole(v.calculated_rooms) || !whole(v.uncalculable_rooms)
      || !whole(v.calculable_subtotal_clp) || !nullable(v.total_cost_clp, whole)
      || !nullable(v.budget_clp, whole) || !nullable(v.budget_difference_clp, signedWhole)
      || !nullable(v.budget_excess_clp, whole) || !nullable(v.fits_budget, x => typeof x === 'boolean')) return false;
  const rooms = v.rooms as FloorRoomResponse[];
  const input = payload.rooms as Record<string, unknown>[];
  if (new Set(rooms.map(r => r.room_id)).size !== rooms.length) return false;
  if (!rooms.every(r => input.some(i => record(i) && record(i.publication)
    && i.room_id === r.room_id && i.publication.publication_key === r.publication_key
    && i.publication.source === r.source && i.publication.price_per_box_clp === r.price_per_box_clp
    && (i.publication.coverage_per_box_m2 === null ? r.coverage_per_box_m2 === null
      : decimalEqual(i.publication.coverage_per_box_m2, r.coverage_per_box_m2))
    && decimalEqual(i.waste_percent ?? '10', r.waste_percent)
    && (i.area_m2 === undefined || decimalEqual(i.area_m2, r.area_m2))
    && (i.budget_clp ?? null) === r.budget_clp
    && (i.publication.availability ?? 'unknown') === r.availability
    && r.reasons.includes('missing_price') === (i.publication.price_per_box_clp === null)
    && r.reasons.includes('missing_coverage') === (i.publication.coverage_per_box_m2 === null)
    && Date.parse(String(i.publication.checked_at)) === Date.parse(r.checked_at)))) return false;
  if (v.budget_clp !== (payload.budget_clp ?? null)) return false;
  const calculated = rooms.filter(r => r.status === 'calculated').length;
  if (v.calculated_rooms !== calculated || v.uncalculable_rooms !== rooms.length - calculated) return false;
  if (v.calculable_subtotal_clp !== rooms.reduce((sum, r) => sum + (r.cost_clp ?? 0), 0)) return false;
  if (calculated === rooms.length) return v.status === 'complete' && v.total_cost_clp === v.calculable_subtotal_clp;
  return v.status === (calculated ? 'partial' : 'uncalculable') && v.total_cost_clp === null
    && v.fits_budget === null && v.budget_difference_clp === null && v.budget_excess_clp === null;
}

export function isFloorSuggestionsResponse(
  value: unknown,
  payload: unknown,
): value is FloorSuggestionsResponse {
  if (
    !record(value) || value.rule_version !== 'floor-rules-v1' ||
    !oneOf(value.status, ['within_budget', 'over_budget', 'no_candidates']) ||
    !Array.isArray(value.items) || value.items.length > 3 ||
    !record(payload) || !signedWhole(payload.available_budget_clp) ||
    !Array.isArray(payload.candidates)
  ) return false;
  if (value.status === 'no_candidates') return value.items.length === 0;
  if (value.items.length === 0) return false;

  const budget = payload.available_budget_clp;
  const candidates = new Map(
    payload.candidates.filter(record).map(candidate => [candidate.publication_key, candidate]),
  );
  const seen = new Set<string>();
  for (const item of value.items) {
    if (
      !record(item) || typeof item.publication_key !== 'string' ||
      seen.has(item.publication_key) || !whole(item.boxes) || item.boxes === 0 ||
      !whole(item.cost_clp) || !whole(item.budget_excess_clp) ||
      !Array.isArray(item.reasons) || item.reasons.length < 1 || item.reasons.length > 5 ||
      !item.reasons.every(reason => typeof reason === 'string' && reason.trim().length > 0 && reason.length <= 300)
    ) return false;
    const candidate = candidates.get(item.publication_key);
    if (
      !candidate || candidate.availability === 'unavailable' ||
      !whole(candidate.price_per_box_clp) || candidate.price_per_box_clp === 0 ||
      !decimal(candidate.coverage_per_box_m2) || Number(candidate.coverage_per_box_m2) <= 0 ||
      item.cost_clp !== item.boxes * candidate.price_per_box_clp ||
      item.budget_excess_clp !== Math.max(0, item.cost_clp - budget) ||
      (value.status === 'within_budget') !== (item.budget_excess_clp === 0)
    ) return false;
    seen.add(item.publication_key);
  }
  return true;
}

@Injectable()
export class PythonService {
  async calculateBudget(payload: unknown, requestId?: string): Promise<FloorBudgetResponse> {
    const result = await this.json('/floors/budget', payload, requestId, 10_000, this.internalHeaders());
    if (!isFloorBudgetResponse(result, payload)) {
      throw new BadGatewayException('El cálculo de pisos no cumple el contrato esperado');
    }
    return result;
  }

  async recommendFloors(payload: unknown, requestId?: string): Promise<FloorSuggestionsResponse> {
    const result = await this.json('/recommendations/floors', payload, requestId, 10_000, this.internalHeaders());
    if (!isFloorSuggestionsResponse(result, payload)) {
      throw new BadGatewayException('Las sugerencias de pisos no cumplen el contrato esperado');
    }
    return result;
  }

  compareDemonstration(payload: unknown, requestId?: string): Promise<unknown> {
    return this.json('/recommendations/compare', payload, requestId, 5_000, this.internalHeaders());
  }

  capture(payload: unknown, requestId?: string): Promise<unknown> {
    const configured = Number(process.env.PYTHON_CAPTURE_TIMEOUT_MS ?? 600_000);
    const timeout = Number.isInteger(configured) && configured >= 1_000 && configured <= 900_000 ? configured : 600_000;
    return this.json('/materials/captures', payload, requestId, timeout, this.internalHeaders());
  }

  async health(): Promise<void> {
    const result = await this.json('/health', undefined, undefined, 3000);
    if (!record(result) || result.status !== 'ok') throw new BadGatewayException('Salud Python inválida');
  }

  private internalHeaders(): Record<string, string> {
    const token = process.env.MATERIALS_API_TOKEN ?? '';
    if (token.length < 24 || token.length > 256 || token.startsWith('replace-')) {
      throw new ServiceUnavailableException('Configure la credencial interna de Python');
    }
    return { 'X-Materials-Token': token };
  }

  private async json(path: string, payload: unknown, correlation: string | undefined, timeout: number,
    extraHeaders: Record<string, string> = {}): Promise<unknown> {
    const requestId = correlation && /^[A-Za-z0-9_-]{1,64}$/.test(correlation) ? correlation : randomUUID();
    const started = performance.now();
    let response: Response;
    const signal = AbortSignal.timeout(timeout);
    try {
      const base = new URL(process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000');
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid Python URL');
      response = await fetch(new URL(path, base), {
        method: payload === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', 'X-Request-ID': requestId, ...extraHeaders },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal,
        redirect: 'error',
      });
    } catch {
      this.log(path, requestId, 'unavailable', started);
      throw new ServiceUnavailableException('El servicio Python no está disponible o agotó su tiempo de espera');
    }
    if (!response.ok) {
      await response.body?.cancel();
      this.log(path, requestId, response.status, started);
      throw new BadGatewayException('El servicio Python rechazó la operación');
    }
    try {
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('Invalid content type');
      if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new Error('Response too large');
      if (!response.body) throw new Error('Missing body');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > MAX_RESPONSE_BYTES) throw new Error('Response too large');
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      this.log(path, requestId, 'ok', started);
      return result;
    } catch {
      this.log(path, requestId, 'invalid_response', started);
      throw new BadGatewayException('El servicio Python devolvió una respuesta inválida o incompleta');
    }
  }

  private log(path: string, requestId: string, result: string | number, start: number) {
    console.info(JSON.stringify({ service: 'backend', event: 'python_request', path,
      request_id: requestId, result, duration_ms: Math.round((performance.now() - start) * 100) / 100 }));
  }
}
