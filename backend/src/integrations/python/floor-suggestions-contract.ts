export interface FloorPublicationSnapshot {
  publication_key: string;
  source: string;
  price_per_box_clp: number | null;
  coverage_per_box_m2: string | null;
  currency: string;
  price_type: string;
  checked_at: string;
  availability: string;
}

export interface FloorRoomContext {
  room_id: string;
  area_m2?: string;
  length_m?: string;
  width_m?: string;
  waste_percent: string;
  budget_clp: number | null;
}

export interface FloorSuggestionRequest {
  budget_clp: number;
  room: FloorRoomContext & {
    preferred_category: string | null;
    preferred_source: string | null;
  };
  other_rooms: (FloorRoomContext & {
    publication: FloorPublicationSnapshot | null;
  })[];
  publications: (FloorPublicationSnapshot & {
    category: string;
    name: string;
  })[];
  exclude?: string[];
  selected_publication_key?: string;
}

export interface RankedFloor {
  publication_key: string;
  boxes: number;
  total_clp: number;
  fits_budget: boolean;
  budget_excess_clp: number;
  reasons: string[];
  price_stale: boolean;
}

export interface FloorSuggestionResponse {
  available_budget_clp: number;
  provisional_budget: boolean;
  empty_reason: 'no_calculable_options' | 'all_dismissed' | null;
  suggestions: RankedFloor[];
}

const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFloorSuggestionResponse(
  value: unknown,
  input: FloorSuggestionRequest,
): value is FloorSuggestionResponse {
  if (
    !isRecord(value) ||
    !whole(value.available_budget_clp) ||
    typeof value.provisional_budget !== 'boolean'
  )
    return false;
  const available = value.available_budget_clp;
  if (
    available >
    Math.min(input.budget_clp, input.room.budget_clp ?? input.budget_clp)
  )
    return false;
  const suggestions = value.suggestions;
  if (
    !Array.isArray(suggestions) ||
    suggestions.length > (input.selected_publication_key ? 1 : 3)
  )
    return false;
  if (suggestions.length === 0)
    return (
      value.empty_reason === 'no_calculable_options' ||
      (value.empty_reason === 'all_dismissed' &&
        !!input.exclude?.length &&
        !input.selected_publication_key)
    );
  if (value.empty_reason !== null) return false;

  const candidates = new Map(
    input.publications.map((candidate) => [
      candidate.publication_key,
      candidate,
    ]),
  );
  const keys = new Set<string>();
  const hasFit = suggestions.some(
    (item) => isRecord(item) && item.fits_budget === true,
  );
  return suggestions.every((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.publication_key !== 'string' ||
      keys.has(item.publication_key)
    )
      return false;
    const key = item.publication_key;
    keys.add(key);
    const candidate = candidates.get(key);
    return (
      !!candidate &&
      candidate.availability !== 'unavailable' &&
      whole(candidate.price_per_box_clp) &&
      candidate.price_per_box_clp > 0 &&
      candidate.coverage_per_box_m2 !== null &&
      Number(candidate.coverage_per_box_m2) > 0 &&
      (input.selected_publication_key
        ? key === input.selected_publication_key
        : !input.exclude?.includes(key)) &&
      whole(item.boxes) &&
      item.boxes > 0 &&
      whole(item.total_clp) &&
      item.total_clp === item.boxes * candidate.price_per_box_clp &&
      item.fits_budget === item.total_clp <= available &&
      (!hasFit || item.fits_budget === true) &&
      item.budget_excess_clp === Math.max(0, item.total_clp - available) &&
      typeof item.price_stale === 'boolean' &&
      Array.isArray(item.reasons) &&
      item.reasons.length > 0 &&
      item.reasons.length <= 8 &&
      item.reasons.every(
        (reason) =>
          typeof reason === 'string' &&
          reason.length > 0 &&
          reason.length <= 250,
      )
    );
  });
}
