import type { Publication, Room } from '../../generated/prisma/client.js';

export function roomFloorInput(room: Room) {
  return {
    ...(room.areaMode === 'area'
      ? { area_m2: room.areaM2!.toString() }
      : {
          length_m: room.lengthM!.toString(),
          width_m: room.widthM!.toString(),
        }),
    waste_percent: room.wastePercent.toString(),
  };
}

export function publicationFloorInput(publication: Publication) {
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

export function roomBudgetInput(room: Room, publication: Publication) {
  return {
    room_id: room.id,
    ...roomFloorInput(room),
    budget_clp: room.budgetClp === null ? null : Number(room.budgetClp),
    publication: publicationFloorInput(publication),
  };
}
