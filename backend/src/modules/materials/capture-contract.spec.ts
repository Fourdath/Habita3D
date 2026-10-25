import { sampleCapture } from '../../../test/fixtures/capture-fixture.js';

import {
  captureHash,
  chileDisplay,
  validateCapture,
} from './capture-contract.js';
import type { CapturedResult } from './capture-contract.js';

describe('captured retailer result contract', () => {
  it('accepts exact normalized captures, including zero duplicate percentage', () => {
    const value = sampleCapture();
    expect(validateCapture(value)).toBe(value);
  });

  it('hashes object properties canonically, preserving the identity of a replay', () => {
    const value = sampleCapture();
    const reordered = Object.fromEntries(
      Object.entries(value).reverse(),
    ) as unknown as CapturedResult;
    expect(captureHash(reordered)).toBe(captureHash(value));
    reordered.publications[0].name = 'Otro nombre';
    expect(captureHash(reordered)).not.toBe(captureHash(sampleCapture()));
  });

  it.each([
    [
      'unknown version',
      (c: any) => {
        c.schema_version = '2.0';
      },
    ],
    [
      'missing field',
      (c: any) => {
        delete c.origin;
      },
    ],
    [
      'unexpected field',
      (c: any) => {
        c.additional = true;
      },
    ],
    [
      'fake identity',
      (c: any) => {
        c.publications[0].external_id = 'OTHER';
      },
    ],
    [
      'wrong seller',
      (c: any) => {
        c.publications[0].seller = 'Marketplace';
      },
    ],
    [
      'wrong currency',
      (c: any) => {
        c.publications[0].currency = 'USD';
      },
    ],
    [
      'wrong location',
      (c: any) => {
        c.publications[0].commune_code = '13114';
      },
    ],
    [
      'unsafe product URL',
      (c: any) => {
        c.publications[0].product_url = 'https://evil.test/product';
      },
    ],
    [
      'unsafe image URL',
      (c: any) => {
        c.publications[0].image_url = 'javascript:alert(1)';
      },
    ],
    [
      'fractional CLP',
      (c: any) => {
        c.publications[0].price_per_box_clp = 2.5;
      },
    ],
    [
      'boolean CLP',
      (c: any) => {
        c.publications[0].price_per_box_clp = true;
      },
    ],
    [
      'invented price per m2',
      (c: any) => {
        c.publications[0].price_per_m2_clp = '4';
      },
    ],
    [
      'unknown coverage as zero',
      (c: any) => {
        c.publications[0].coverage_per_box_m2 = '0';
      },
    ],
    [
      'invalid coverage precision',
      (c: any) => {
        c.publications[0].coverage_per_box_m2 = '2.0000001';
      },
    ],
    [
      'nonfinite coverage',
      (c: any) => {
        c.publications[0].coverage_per_box_m2 = 'NaN';
      },
    ],
    [
      'unknown unit with coverage',
      (c: any) => {
        c.publications[0].sale_unit = 'unknown';
      },
    ],
    [
      'missing timezone',
      (c: any) => {
        c.started_at = '2026-10-18T15:00:00';
      },
    ],
    [
      'invalid calendar date',
      (c: any) => {
        c.started_at = '2026-02-30T15:00:00Z';
      },
    ],
    [
      'future capture',
      (c: any) => {
        c.finished_at = '2099-01-01T15:00:00Z';
      },
    ],
    [
      'wrong display date',
      (c: any) => {
        c.publications[0].last_checked_display = '01/01/2020 00:00';
      },
    ],
    [
      'updated date outside capture',
      (c: any) => {
        c.started_at = '2026-10-18T15:00:01Z';
        c.finished_at = c.started_at;
      },
    ],
    [
      'duplicate publication',
      (c: any) => {
        c.publications.push(c.publications[0]);
      },
    ],
    [
      'duplicate updated key',
      (c: any) => {
        c.updated_publication_keys.push(c.updated_publication_keys[0]);
      },
    ],
    [
      'overlapping partition',
      (c: any) => {
        c.retained_publication_keys.push(c.updated_publication_keys[0]);
      },
    ],
    [
      'missing updated/retained key',
      (c: any) => {
        c.updated_publication_keys = [];
      },
    ],
    [
      'wrong selected count',
      (c: any) => {
        c.groups[0].metrics.selected_records = 0;
      },
    ],
    [
      'wrong metric population',
      (c: any) => {
        c.groups[0].metrics.retrieved_records = 2;
      },
    ],
    [
      'wrong metric percentage',
      (c: any) => {
        c.groups[0].metrics.validity_percent = '50';
      },
    ],
    [
      'wrong group source',
      (c: any) => {
        c.groups[0].source = 'easy';
        c.groups[0].request_urls = [];
      },
    ],
    [
      'failed group with updates',
      (c: any) => {
        c.groups[0].status = 'failed';
        c.status = 'failed';
      },
    ],
    [
      'inconsistent status',
      (c: any) => {
        c.status = 'partial';
      },
    ],
    [
      'manual scheduled slot',
      (c: any) => {
        c.scheduled_for = c.started_at;
      },
    ],
  ])('rejects %s before database access', (_name, mutate) => {
    const value = sampleCapture();
    mutate(value);
    expect(() => validateCapture(value)).toThrow(
      'Contrato de captura inválido',
    );
  });

  it('allows explicitly unknown coverage without inventing a comparable price', () => {
    const value = sampleCapture();
    Object.assign(value.publications[0], {
      coverage_per_box_m2: null,
      price_per_m2_clp: null,
      comparable: false,
    });
    value.groups[0].metrics.comparable_records = 0;
    expect(
      validateCapture(value).publications[0].coverage_per_box_m2,
    ).toBeNull();
  });

  it('retains old observations on failed source attempts without assigning a new checked_at', () => {
    const value = sampleCapture('failed', '2026-10-19T15:00:00Z');
    Object.assign(value.publications[0], {
      checked_at: '2026-10-18T15:00:00Z',
      last_checked_display: chileDisplay('2026-10-18T15:00:00Z'),
    });
    value.status = 'failed';
    value.groups[0].status = 'failed';
    value.groups[0].metrics = {
      retrieved_records: 0,
      valid_records: 0,
      rejected_records: 0,
      excluded_records: 0,
      duplicate_records: 0,
      comparable_records: 0,
      selected_records: 0,
      validity_percent: null,
      duplicates_percent: null,
    };
    value.groups[0].errors = [
      { code: 'source_blocked', message: 'Fuente no disponible' },
    ];
    value.retained_publication_keys = value.updated_publication_keys;
    value.updated_publication_keys = [];
    value.groups[0].missing_publication_keys = value.retained_publication_keys;
    expect(validateCapture(value).publications[0].checked_at).toBe(
      '2026-10-18T15:00:00Z',
    );
  });

  it('formats Chile time correctly in summer and winter', () => {
    expect(chileDisplay('2026-01-10T12:00:00Z')).toBe('10/01/2026 09:00');
    expect(chileDisplay('2026-07-10T12:00:00Z')).toBe('10/07/2026 08:00');
  });
});
