import { createHash } from 'node:crypto';
import { chileDisplay } from '../../src/modules/materials/capture-contract.js';
import type { CapturedResult } from '../../src/modules/materials/capture-contract.js';

export function sampleCapture(
  runId = 'capture-1',
  checkedAt = '2026-10-18T15:00:00Z',
  price = 10000,
): CapturedResult {
  const key = createHash('sha256')
    .update('sodimac|100|sku-100|sodimac|13110|CLP|public')
    .digest('hex');
  return {
    schema_version: '1.0',
    run_id: runId,
    request_id: 'test-request',
    origin: 'live',
    trigger: 'manual',
    scheduled_for: null,
    started_at: checkedAt,
    finished_at: checkedAt,
    status: 'complete',
    storage: 'local_evidence_cache',
    groups: [
      {
        source: 'sodimac',
        category: 'ceramic',
        status: 'complete',
        pages: 1,
        metrics: {
          retrieved_records: 1,
          valid_records: 1,
          rejected_records: 0,
          excluded_records: 0,
          duplicate_records: 0,
          comparable_records: 1,
          selected_records: 1,
          validity_percent: '100.00',
          duplicates_percent: '0.00',
        },
        request_urls: ['https://www.sodimac.cl/listing'],
        errors: [],
        warnings: [],
        missing_publication_keys: [],
      },
    ],
    publications: [
      {
        publication_key: key,
        source: 'sodimac',
        external_id: '100',
        sku: 'sku-100',
        seller: 'Sodimac',
        name: 'Cerámica de prueba',
        brand: null,
        category: 'ceramic',
        product_url: 'https://www.sodimac.cl/producto/100',
        image_url: null,
        currency: 'CLP',
        price_type: 'public',
        price_per_box_clp: price,
        sale_unit: 'box',
        coverage_per_box_m2: '2',
        price_per_m2_clp: String(price / 2),
        reported_price_m2_clp: null,
        availability: 'unknown',
        commune_code: '13110',
        commune: 'La Florida',
        region: 'Metropolitana',
        checked_at: checkedAt,
        last_checked_display: chileDisplay(checkedAt),
        comparable: true,
        promotions: [],
        evidence: {},
        extractor_version: 'ep2-v1',
      },
    ],
    updated_publication_keys: [key],
    retained_publication_keys: [],
  };
}
