import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma.service.js';

import { sampleCapture } from '../../../test/fixtures/capture-fixture.js';
import { MaterialsService } from './materials.service.js';
import { chileDisplay } from './capture-contract.js';

function memoryDatabase() {
  const runs = new Map<string, any>();
  const publications = new Map<string, any>();
  const observations: any[] = [];
  const toRow = (data: any) => ({
    ...data,
    coveragePerBoxM2:
      data.coveragePerBoxM2 === null
        ? null
        : new Prisma.Decimal(data.coveragePerBoxM2),
    pricePerM2Clp:
      data.pricePerM2Clp === null
        ? null
        : new Prisma.Decimal(data.pricePerM2Clp),
  });
  const tx = {
    $queryRaw: vi.fn(async () => [{ locked: '' }]),
    captureRun: {
      findUnique: vi.fn(
        async ({ where }: any) => runs.get(where.runId) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        runs.set(data.runId, data);
        return data;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(runs.get(where.runId), data);
        return runs.get(where.runId);
      }),
    },
    publication: {
      findUnique: vi.fn(
        async ({ where }: any) =>
          publications.get(where.publicationKey) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = toRow(data);
        publications.set(data.publicationKey, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = toRow(data);
        publications.set(where.publicationKey, row);
        return row;
      }),
      count: vi.fn(
        async ({ where }: any) =>
          [...publications.values()].filter(
            (p) => p.source === where.source && p.category === where.category,
          ).length,
      ),
    },
    priceObservation: {
      create: vi.fn(async ({ data }: any) => {
        observations.push(data);
        return data;
      }),
    },
  };
  const prisma = { $transaction: vi.fn(async (callback: any) => callback(tx)) };
  return { prisma, tx, runs, publications, observations };
}

describe('MaterialsService transactional import', () => {
  it('replays an identical capture without rewriting publications or observations', async () => {
    const db = memoryDatabase();
    const service = new MaterialsService(db.prisma as unknown as PrismaService);
    const capture = sampleCapture();
    expect(await service.importCapture(capture)).toMatchObject({
      replayed: false,
      updatedCount: 1,
    });
    expect(await service.importCapture(capture)).toMatchObject({
      replayed: true,
      updatedCount: 1,
    });
    expect(db.publications.size).toBe(1);
    expect(db.observations).toHaveLength(1);
    expect(db.tx.publication.create).toHaveBeenCalledTimes(1);
    expect(db.tx.publication.update).not.toHaveBeenCalled();
    expect(db.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects a run id reused with a different valid payload', async () => {
    const db = memoryDatabase();
    const service = new MaterialsService(db.prisma as unknown as PrismaService);
    await service.importCapture(sampleCapture());
    await expect(
      service.importCapture(
        sampleCapture('capture-1', '2026-10-18T15:00:00Z', 12000),
      ),
    ).rejects.toThrow('otro resultado');
    expect(db.observations).toHaveLength(1);
  });

  it('renews successful check timestamps without adding price changes, then records a real change', async () => {
    const db = memoryDatabase();
    const service = new MaterialsService(db.prisma as unknown as PrismaService);
    const initial = sampleCapture();
    await service.importCapture(initial);
    await service.importCapture(sampleCapture('same', '2026-10-19T15:00:00Z'));
    const key = initial.publications[0].publication_key;
    expect(db.publications.get(key).checkedAt.toISOString()).toBe(
      '2026-10-19T15:00:00.000Z',
    );
    expect(db.observations).toHaveLength(1);
    await service.importCapture(
      sampleCapture('changed', '2026-10-20T15:00:00Z', 11000),
    );
    expect(db.observations.map((o) => o.pricePerBoxClp)).toEqual([
      10000, 11000,
    ]);
    expect(db.observations[1].changeType).toBe('price_or_pack_change');
  });

  it('keeps the last valid value and timestamp during source failure', async () => {
    const db = memoryDatabase();
    const service = new MaterialsService(db.prisma as unknown as PrismaService);
    const initial = sampleCapture();
    await service.importCapture(initial);
    const failed = sampleCapture('failed', '2026-10-19T15:00:00Z');
    Object.assign(failed.publications[0], {
      checked_at: initial.publications[0].checked_at,
      last_checked_display: chileDisplay(initial.publications[0].checked_at),
    });
    failed.status = 'failed';
    failed.groups[0].status = 'failed';
    failed.groups[0].metrics = {
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
    failed.retained_publication_keys = failed.updated_publication_keys;
    failed.updated_publication_keys = [];
    failed.groups[0].missing_publication_keys =
      failed.retained_publication_keys;
    expect(await service.importCapture(failed)).toMatchObject({
      updatedCount: 0,
      retainedCount: 1,
      status: 'failed',
    });
    expect(
      db.publications
        .get(initial.publications[0].publication_key)
        .checkedAt.toISOString(),
    ).toBe('2026-10-18T15:00:00.000Z');
    expect(db.observations).toHaveLength(1);
  });

  it('does not move current prices backwards when older captures are imported out of order', async () => {
    const db = memoryDatabase();
    const service = new MaterialsService(db.prisma as unknown as PrismaService);
    await service.importCapture(
      sampleCapture('newer', '2026-10-20T15:00:00Z', 12000),
    );
    expect(
      await service.importCapture(
        sampleCapture('older', '2026-10-18T15:00:00Z'),
      ),
    ).toMatchObject({ updatedCount: 0, retainedCount: 1 });
    expect([...db.publications.values()][0].pricePerBoxClp).toBe(12000);
    expect(db.observations).toHaveLength(1);
  });

  it('rejects malformed captures before opening a transaction', async () => {
    const db = memoryDatabase();
    const service = new MaterialsService(db.prisma as unknown as PrismaService);
    await expect(
      service.importCapture({ schema_version: 'wrong' }),
    ).rejects.toThrow('Contrato de captura inválido');
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });
});
