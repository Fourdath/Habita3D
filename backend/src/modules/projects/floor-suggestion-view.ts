import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { Publication, Room } from '../../generated/prisma/client.js';
import type {
  FloorRoomContext,
  FloorSuggestionRequest,
  RankedFloor,
} from '../../integrations/python/floor-suggestions-contract.js';

export function snapshotRoom(room: Room): FloorRoomContext {
  return {
    room_id: room.id,
    ...(room.areaMode === 'area'
      ? { area_m2: room.areaM2?.toString() }
      : {
          length_m: room.lengthM?.toString(),
          width_m: room.widthM?.toString(),
        }),
    waste_percent: room.wastePercent.toString(),
    budget_clp: room.budgetClp === null ? null : Number(room.budgetClp),
  };
}

export function snapshotPublication(publication: Publication) {
  return {
    publication_key: publication.publicationKey,
    source: publication.source,
    price_per_box_clp: publication.pricePerBoxClp,
    coverage_per_box_m2: publication.coveragePerBoxM2?.toString() ?? null,
    currency: publication.currency,
    price_type: publication.priceType,
    checked_at: publication.checkedAt.toISOString(),
    availability: publication.availability,
  };
}

function terms(input: FloorSuggestionRequest, key: string) {
  const publication = input.publications.find(
    (candidate) => candidate.publication_key === key,
  );
  if (!publication) throw new Error('No existe la publicación evaluada');
  return {
    budget: input.budget_clp,
    room: input.room,
    commitments: input.other_rooms,
    publication,
  };
}

export function quoteTermsDigest(
  input: FloorSuggestionRequest,
  key: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify(terms(input, key)))
    .digest('base64url');
}

function quoteSignature(
  secret: string,
  userId: number,
  projectId: number,
  roomId: string,
  key: string,
  digest: string,
) {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify([
        'floor-quote-v1',
        userId,
        projectId,
        roomId,
        key,
        digest,
      ]),
    )
    .digest('base64url');
}

export function validQuote(
  secret: string,
  userId: number,
  projectId: number,
  roomId: string,
  key: string,
  quoteId: string,
): boolean {
  const [digest, supplied, extra] = quoteId.split('.');
  if (!digest || !supplied || extra !== undefined) return false;
  const expected = quoteSignature(
    secret,
    userId,
    projectId,
    roomId,
    key,
    digest,
  );
  const signature = Buffer.from(supplied);
  return (
    signature.length === expected.length &&
    timingSafeEqual(signature, Buffer.from(expected))
  );
}

export function suggestionView(
  input: FloorSuggestionRequest,
  ranked: RankedFloor,
  userId: number,
  projectId: number,
  secret: string,
) {
  const key = ranked.publication_key;
  const { publication } = terms(input, key);
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        quoteTermsDigest(input, key),
        ranked.boxes,
        ranked.total_clp,
        ranked.fits_budget,
        ranked.budget_excess_clp,
      ]),
    )
    .digest('base64url');
  const signature = quoteSignature(
    secret,
    userId,
    projectId,
    input.room.room_id,
    key,
    digest,
  );
  return {
    publicationKey: key,
    name: publication.name,
    source: publication.source,
    category: publication.category,
    availability: publication.availability,
    checkedAt: publication.checked_at,
    priceStale: ranked.price_stale,
    boxes: ranked.boxes,
    totalClp: ranked.total_clp,
    fitsBudget: ranked.fits_budget,
    budgetExcessClp: ranked.budget_excess_clp,
    reasons: ranked.reasons,
    quoteId: `${digest}.${signature}`,
  };
}
