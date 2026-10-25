import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';

export interface CapturedPublication {
  publication_key: string;
  source: 'sodimac' | 'easy';
  external_id: string;
  sku: string | null;
  seller: string;
  name: string;
  brand: string | null;
  category: 'ceramic' | 'laminate';
  product_url: string;
  image_url: string | null;
  currency: 'CLP';
  price_type: 'public';
  price_per_box_clp: number;
  sale_unit: 'box' | 'unknown';
  coverage_per_box_m2: string | null;
  price_per_m2_clp: string | null;
  reported_price_m2_clp: string | null;
  availability: 'available' | 'unavailable' | 'unknown';
  commune_code: '13110';
  commune: 'La Florida';
  region: 'Metropolitana';
  checked_at: string;
  last_checked_display: string;
  comparable: boolean;
  promotions: Prisma.InputJsonValue[];
  evidence: Prisma.InputJsonObject;
  extractor_version: 'ep2-v1';
}

export interface CaptureGroup {
  source: 'sodimac' | 'easy';
  category: 'ceramic' | 'laminate';
  status: 'complete' | 'partial' | 'failed';
  metrics: Record<string, number | string | null>;
  pages: number;
  request_urls: string[];
  errors: { code: string; message: string }[];
  warnings: string[];
  missing_publication_keys: string[];
}

export interface CapturedResult {
  schema_version: '1.0';
  run_id: string;
  request_id: string;
  origin: 'live';
  trigger: 'manual' | 'scheduled';
  scheduled_for: string | null;
  started_at: string;
  finished_at: string;
  status: 'complete' | 'partial' | 'failed';
  groups: CaptureGroup[];
  publications: CapturedPublication[];
  updated_publication_keys: string[];
  retained_publication_keys: string[];
  storage: 'local_evidence_cache';
}

function invalid(path: string): never {
  throw new BadRequestException(`Contrato de captura inválido: ${path}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(path);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: string[],
  path: string,
): void {
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in value))
  ) {
    invalid(`${path} (campos ausentes o desconocidos)`);
  }
}

function text(
  value: unknown,
  path: string,
  max = 500,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    invalid(path);
  return value;
}

function integer(value: unknown, path: string, min = 0, max = 10000): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    invalid(path);
  return value as number;
}

function oneOf(
  value: unknown,
  allowed: readonly unknown[],
  path: string,
): void {
  if (!allowed.includes(value)) invalid(path);
}

function array(value: unknown, path: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    invalid(path);
  return value;
}

function timestamp(value: unknown, path: string): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    invalid(path);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) invalid(path);
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-').map(Number);
  if (
    new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date
  )
    invalid(path);
  return time;
}

function decimal(
  value: unknown,
  path: string,
  nullable: boolean,
  max: string,
  digits: number,
  allowZero = false,
): Prisma.Decimal | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,3})?$/.test(value)
  )
    invalid(path);
  const result = new Prisma.Decimal(value);
  if (
    !result.isFinite() ||
    (allowZero ? result.lt(0) : result.lte(0)) ||
    result.gt(max) ||
    result.decimalPlaces() > digits
  )
    invalid(path);
  return result;
}

function url(value: unknown, path: string, host?: string): void {
  if (typeof value !== 'string' || value.length > 4000) invalid(path);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid(path);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '443') ||
    (host && parsed.hostname !== host)
  )
    invalid(path);
}

export function chileDisplay(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === name)!.value;
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

function publication(value: unknown): CapturedPublication {
  const p = object(value, 'publication');
  exactKeys(
    p,
    [
      'publication_key',
      'source',
      'external_id',
      'sku',
      'seller',
      'name',
      'brand',
      'category',
      'product_url',
      'image_url',
      'currency',
      'price_type',
      'price_per_box_clp',
      'sale_unit',
      'coverage_per_box_m2',
      'price_per_m2_clp',
      'reported_price_m2_clp',
      'availability',
      'commune_code',
      'commune',
      'region',
      'checked_at',
      'last_checked_display',
      'comparable',
      'promotions',
      'evidence',
      'extractor_version',
    ],
    'publication',
  );
  oneOf(p.source, ['sodimac', 'easy'], 'source');
  oneOf(p.category, ['ceramic', 'laminate'], 'category');
  text(p.external_id, 'external_id', 100);
  text(p.sku, 'sku', 200, true);
  const seller = p.source === 'sodimac' ? 'Sodimac' : 'Easy';
  if (p.seller !== seller) invalid('seller');
  text(p.name, 'name');
  text(p.brand, 'brand', 500, true);
  url(p.product_url, 'product_url', `www.${p.source}.cl`);
  if (p.image_url !== null) url(p.image_url, 'image_url');
  oneOf(p.currency, ['CLP'], 'currency');
  oneOf(p.price_type, ['public'], 'price_type');
  integer(p.price_per_box_clp, 'price_per_box_clp', 1, 1_000_000_000);
  oneOf(p.sale_unit, ['box', 'unknown'], 'sale_unit');
  const coverage = decimal(
    p.coverage_per_box_m2,
    'coverage_per_box_m2',
    true,
    '1000',
    6,
  );
  if (coverage && coverage.lt('0.000001')) invalid('coverage_per_box_m2');
  if (p.sale_unit !== 'box' && coverage !== null) invalid('sale_unit/coverage');
  const perM2 = decimal(
    p.price_per_m2_clp,
    'price_per_m2_clp',
    true,
    '1000000000000000',
    2,
    true,
  );
  if (
    coverage === null
      ? perM2 !== null
      : perM2 === null ||
        !perM2.equals(
          new Prisma.Decimal(p.price_per_box_clp as number)
            .div(coverage)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        )
  )
    invalid('price_per_m2_clp');
  decimal(
    p.reported_price_m2_clp,
    'reported_price_m2_clp',
    true,
    '10000000000000',
    6,
  );
  if (p.comparable !== (coverage !== null)) invalid('comparable');
  oneOf(
    p.availability,
    ['available', 'unavailable', 'unknown'],
    'availability',
  );
  if (
    p.commune_code !== '13110' ||
    p.commune !== 'La Florida' ||
    p.region !== 'Metropolitana'
  )
    invalid('location');
  timestamp(p.checked_at, 'checked_at');
  if (p.last_checked_display !== chileDisplay(p.checked_at as string))
    invalid('last_checked_display');
  array(p.promotions, 'promotions', 100).forEach((promotion) =>
    object(promotion, 'promotion'),
  );
  object(p.evidence, 'evidence');
  oneOf(p.extractor_version, ['ep2-v1'], 'extractor_version');
  const identity = `${p.source}|${p.external_id}|${p.sku ?? ''}|${seller.toLowerCase()}|13110|CLP|public`;
  if (p.publication_key !== createHash('sha256').update(identity).digest('hex'))
    invalid('publication_key/identity');
  return p as unknown as CapturedPublication;
}

function keys(value: unknown, path: string): string[] {
  const rows = array(value, path, 40);
  if (
    rows.some((key) => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
  )
    invalid(path);
  if (new Set(rows).size !== rows.length) invalid(`${path} duplicates`);
  return rows as string[];
}

function group(value: unknown): CaptureGroup {
  const g = object(value, 'group');
  exactKeys(
    g,
    [
      'source',
      'category',
      'status',
      'metrics',
      'pages',
      'request_urls',
      'errors',
      'warnings',
      'missing_publication_keys',
    ],
    'group',
  );
  oneOf(g.source, ['sodimac', 'easy'], 'group.source');
  oneOf(g.category, ['ceramic', 'laminate'], 'group.category');
  oneOf(g.status, ['complete', 'partial', 'failed'], 'group.status');
  integer(g.pages, 'group.pages', 0, 3);
  array(g.request_urls, 'request_urls', 3).forEach((u) =>
    url(u, 'request_url', `www.${g.source}.cl`),
  );
  array(g.errors, 'errors', 100).forEach((error) => {
    const e = object(error, 'error');
    exactKeys(e, ['code', 'message'], 'error');
    text(e.code, 'error.code', 100);
    text(e.message, 'error.message', 500);
  });
  array(g.warnings, 'warnings', 100).forEach((w) => text(w, 'warning', 1000));
  keys(g.missing_publication_keys, 'missing_publication_keys');
  const m = object(g.metrics, 'metrics');
  const counts = [
    'retrieved_records',
    'valid_records',
    'rejected_records',
    'excluded_records',
    'duplicate_records',
    'comparable_records',
    'selected_records',
  ];
  exactKeys(
    m,
    [...counts, 'validity_percent', 'duplicates_percent'],
    'metrics',
  );
  counts.forEach((field) => integer(m[field], `metrics.${field}`));
  if (
    (m.selected_records as number) > 10 ||
    (m.duplicate_records as number) > (m.valid_records as number) ||
    (m.comparable_records as number) > (m.valid_records as number) ||
    (m.selected_records as number) >
      (m.valid_records as number) - (m.duplicate_records as number)
  )
    invalid('metrics counts');
  if (
    (m.valid_records as number) +
      (m.rejected_records as number) +
      (m.excluded_records as number) !==
    m.retrieved_records
  )
    invalid('metrics population');
  for (const [field, numerator] of [
    ['validity_percent', 'valid_records'],
    ['duplicates_percent', 'duplicate_records'],
  ]) {
    if (m.retrieved_records === 0) {
      if (m[field] !== null) invalid(field);
    } else {
      const actual = decimal(m[field], field, false, '100', 2, true);
      // Zero percent is valid, even though monetary decimals above must be positive.
      if (
        !actual?.equals(
          new Prisma.Decimal(m[numerator] as number)
            .mul(100)
            .div(m.retrieved_records as number)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN),
        )
      )
        invalid(field);
    }
  }
  return g as unknown as CaptureGroup;
}

export function validateCapture(value: unknown): CapturedResult {
  try {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 2_000_000)
      invalid('payload size');
  } catch {
    invalid('JSON payload');
  }
  const c = object(value, 'capture');
  exactKeys(
    c,
    [
      'schema_version',
      'run_id',
      'request_id',
      'origin',
      'trigger',
      'scheduled_for',
      'started_at',
      'finished_at',
      'status',
      'groups',
      'publications',
      'updated_publication_keys',
      'retained_publication_keys',
      'storage',
    ],
    'capture',
  );
  oneOf(c.schema_version, ['1.0'], 'schema_version');
  text(c.run_id, 'run_id', 100);
  text(c.request_id, 'request_id', 100);
  oneOf(c.origin, ['live'], 'origin');
  oneOf(c.storage, ['local_evidence_cache'], 'storage');
  oneOf(c.trigger, ['manual', 'scheduled'], 'trigger');
  oneOf(c.status, ['complete', 'partial', 'failed'], 'status');
  const started = timestamp(c.started_at, 'started_at');
  const finished = timestamp(c.finished_at, 'finished_at');
  if (finished < started || finished > Date.now() + 300_000)
    invalid('capture time range');
  if (
    c.trigger === 'manual' ? c.scheduled_for !== null : c.scheduled_for === null
  )
    invalid('scheduled_for');
  if (
    c.scheduled_for !== null &&
    timestamp(c.scheduled_for, 'scheduled_for') > started + 1000
  )
    invalid('scheduled_for');
  const groups = array(c.groups, 'groups', 4, 1).map(group);
  const groupIds = new Set(groups.map((g) => `${g.source}/${g.category}`));
  if (groupIds.size !== groups.length) invalid('groups duplicates');
  const publications = array(c.publications, 'publications', 40).map(
    publication,
  );
  const byKey = new Map(publications.map((p) => [p.publication_key, p]));
  if (byKey.size !== publications.length) invalid('publications duplicates');
  const updated = keys(c.updated_publication_keys, 'updated_publication_keys');
  const retained = keys(
    c.retained_publication_keys,
    'retained_publication_keys',
  );
  if (
    new Set([...updated, ...retained]).size !== publications.length ||
    updated.length + retained.length !== publications.length ||
    [...updated, ...retained].some((key) => !byKey.has(key))
  )
    invalid('updated/retained partition');
  for (const key of updated) {
    const p = byKey.get(key)!;
    if (
      !groupIds.has(`${p.source}/${p.category}`) ||
      timestamp(p.checked_at, 'checked_at') < started ||
      timestamp(p.checked_at, 'checked_at') > finished
    )
      invalid('updated publication timestamp/group');
  }
  for (const p of publications)
    if (timestamp(p.checked_at, 'checked_at') > finished)
      invalid('future publication');
  for (const g of groups) {
    const selected = updated.filter((key) => {
      const p = byKey.get(key)!;
      return p.source === g.source && p.category === g.category;
    }).length;
    if (
      selected !== g.metrics.selected_records ||
      (g.status === 'failed' && selected > 0) ||
      (g.status !== 'failed' && selected === 0)
    )
      invalid('group selection/status');
    if (g.missing_publication_keys.some((key) => !retained.includes(key)))
      invalid('missing/retained keys');
    if (
      g.missing_publication_keys.some((key) => {
        const p = byKey.get(key)!;
        return p.source !== g.source || p.category !== g.category;
      })
    )
      invalid('missing publication group');
    if (g.status === 'complete' && g.missing_publication_keys.length)
      invalid('complete group missing publications');
  }
  const expectedStatus = groups.every((g) => g.status === 'complete')
    ? 'complete'
    : updated.length
      ? 'partial'
      : 'failed';
  if (c.status !== expectedStatus) invalid('capture status');
  for (const source of ['sodimac', 'easy'])
    for (const category of ['ceramic', 'laminate'])
      if (
        publications.filter(
          (p) => p.source === source && p.category === category,
        ).length > 10
      )
        invalid('sample limit');
  return c as unknown as CapturedResult;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function captureHash(capture: CapturedResult): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(capture)))
    .digest('hex');
}
