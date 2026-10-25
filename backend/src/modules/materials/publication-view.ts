import type { Publication } from '../../generated/prisma/client.js';

import { chileDisplay } from './capture-contract.js';

export function serializePublication(publication: Publication) {
  return {
    ...publication,
    coveragePerBoxM2: publication.coveragePerBoxM2?.toString() ?? null,
    pricePerM2Clp: publication.pricePerM2Clp?.toString() ?? null,
    reportedPriceM2Clp: publication.reportedPriceM2Clp?.toString() ?? null,
    checkedAt: publication.checkedAt.toISOString(),
    lastCheckedDisplay: chileDisplay(publication.checkedAt),
    comparable: publication.coveragePerBoxM2 !== null,
    createdAt: publication.createdAt.toISOString(),
    updatedAt: publication.updatedAt.toISOString(),
  };
}
