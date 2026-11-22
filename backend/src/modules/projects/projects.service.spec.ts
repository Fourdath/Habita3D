import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { ProjectsService, surfaceData } from './projects.service.js';

const key = 'a'.repeat(64);
const now = new Date('2026-10-24T12:00:00Z');
const publication = {
  publicationKey: key,
  source: 'sodimac',
  externalId: 'fixture-1',
  sku: null,
  seller: 'Sodimac',
  name: 'Piso de prueba',
  brand: null,
  category: 'ceramic',
  productUrl: 'https://www.sodimac.cl/product/fixture-1',
  imageUrl: null,
  currency: 'CLP',
  priceType: 'public',
  pricePerBoxClp: 10_000,
  saleUnit: 'box',
  coveragePerBoxM2: new Prisma.Decimal('2'),
  pricePerM2Clp: new Prisma.Decimal('5000'),
  reportedPriceM2Clp: null,
  availability: 'unknown',
  communeCode: '13110',
  commune: 'La Florida',
  region: 'Metropolitana',
  checkedAt: now,
  promotions: [],
  evidence: {},
  extractorVersion: 'ep2-v1',
  lastRunId: 'capture1',
  createdAt: now,
  updatedAt: now,
};

const selected = {
  id: '32344a38-1e52-4d6f-bdf6-39bd2ce1e5c0',
  projectId: 1,
  name: 'Dormitorio',
  areaMode: 'area',
  areaM2: new Prisma.Decimal('10'),
  lengthM: null,
  widthM: null,
  wastePercent: new Prisma.Decimal('10'),
  budgetClp: null,
  publicationKey: key,
  publication,
  sceneRoomId: 'bedroom',
  createdAt: now,
  updatedAt: now,
};

const completeBudget = {
  currency: 'CLP',
  status: 'complete',
  rooms: [],
  calculated_rooms: 1,
  uncalculable_rooms: 0,
  calculable_subtotal_clp: 60_000,
  total_cost_clp: 60_000,
  budget_clp: 100_000,
  budget_difference_clp: 40_000,
  budget_excess_clp: 0,
  fits_budget: true,
  scope: 'floor_boxes_only',
  calculation_basis: 'supplied_publication_snapshots',
};

function setup() {
  const project = {
    id: 1,
    ownerId: 7,
    name: 'Casa de prueba',
    budgetClp: 100_000n,
    createdAt: now,
    updatedAt: now,
    rooms: [{ ...selected, publication: { ...publication } }],
  };
  const tx = {
    project: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: number; ownerId: number } }) =>
          where.id === project.id && where.ownerId === project.ownerId
            ? project
            : null,
      ),
      update: vi.fn(async () => project),
      delete: vi.fn(async () => project),
    },
    publication: { findUnique: vi.fn(async (): Promise<typeof publication | null> => publication) },
    room: {
      count: vi.fn(async () => 1),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; projectId: number } }) =>
          where.projectId === 1 && where.id === selected.id ? selected : null,
      ),
      create: vi.fn(async () => selected),
      update: vi.fn(async () => selected),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
  };
  let transactionOpen = false;
  const prisma = {
    ...tx,
    project: {
      ...tx.project,
      create: vi.fn(async () => ({
        ...project,
        ownerId: null,
        rooms: undefined,
        budgetClp: 0n,
      })),
      findMany: vi.fn(async () => [project]),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      transactionOpen = true;
      try {
        return await fn(tx);
      } finally {
        transactionOpen = false;
      }
    }),
  };
  const calculateBudget = vi.fn(
    async (_payload: unknown, _requestId?: string) => {
      expect(transactionOpen).toBe(false);
      return { ...completeBudget };
    },
  );
  const service = new ProjectsService(
    prisma as unknown as PrismaService,
    { calculateBudget } as unknown as PythonService,
  );
  return { service, prisma, tx, project, calculateBudget };
}

describe('private projects and budgets', () => {
  it('never reveals projects or starts calculations for another owner', async () => {
    const { service, calculateBudget, tx } = setup();
    await expect(service.findOne(8, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.budget(8, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(8, 1, { name: 'Intrusión' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(8, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calculateBudget).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(tx.project.delete).not.toHaveBeenCalled();
  });

  it('checks project ownership before every room mutation', async () => {
    const { service, tx } = setup();
    await expect(
      service.createRoom(8, 1, {
        name: 'Nueva',
        areaMode: 'area',
        areaM2: '10',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateRoom(8, 1, selected.id, { publicationKey: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeRoom(8, 1, selected.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.room.create).not.toHaveBeenCalled();
    expect(tx.room.update).not.toHaveBeenCalled();
    expect(tx.room.deleteMany).not.toHaveBeenCalled();
  });

  it('does not allow using a room that belongs to a different project', async () => {
    const { service, tx } = setup();
    tx.room.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateRoom(7, 1, selected.id, { name: 'Renombrada' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.room.update).not.toHaveBeenCalled();
  });

  it('rejects unknown publications and does not create a room', async () => {
    const { service, tx } = setup();
    tx.publication.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.createRoom(7, 1, {
        name: 'Nueva',
        areaMode: 'area',
        areaM2: '10',
        publicationKey: key,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.room.create).not.toHaveBeenCalled();
  });

  it('bounds room count with a per-project row lock', async () => {
    const { service, tx } = setup();
    tx.room.count.mockResolvedValueOnce(100);
    await expect(
      service.createRoom(7, 1, { name: '101', areaMode: 'area', areaM2: '10' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.room.create).not.toHaveBeenCalled();
  });

  it('loads a coherent price snapshot and closes the DB transaction before FastAPI', async () => {
    const { service, prisma, calculateBudget } = setup();
    const result = await service.budget(7, 1, 'correlation-example');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(calculateBudget).toHaveBeenCalledWith(
      {
        budget_clp: 100_000,
        rooms: [
          {
            room_id: selected.id,
            area_m2: '10',
            waste_percent: '10',
            budget_clp: null,
            publication: {
              publication_key: key,
              source: 'sodimac',
              price_per_box_clp: 10_000,
              coverage_per_box_m2: '2',
              currency: 'CLP',
              price_type: 'public',
              checked_at: now.toISOString(),
              availability: 'unknown',
            },
          },
        ],
      },
      'correlation-example',
    );
    expect(result.total_cost_clp).toBe(60_000);
    expect(result.calculation_basis).toBe('latest_persisted_publications');
  });

  it('rereads current prices while retaining the same room and selected publication', async () => {
    const { service, project, calculateBudget } = setup();
    await service.budget(7, 1);
    project.rooms[0].publication.pricePerBoxClp = 12_000;
    project.rooms[0].publication.checkedAt = new Date('2026-10-24T16:00:00Z');
    await service.budget(7, 1);
    const payload = calculateBudget.mock.calls[1]?.[0] as unknown as {
      rooms: {
        room_id: string;
        publication: {
          publication_key: string;
          price_per_box_clp: number;
          checked_at: string;
        };
      }[];
    };
    expect(payload.rooms[0].room_id).toBe(selected.id);
    expect(payload.rooms[0].publication.publication_key).toBe(key);
    expect(payload.rooms[0].publication.price_per_box_clp).toBe(12_000);
    expect(payload.rooms[0].publication.checked_at).toBe(
      '2026-10-24T16:00:00.000Z',
    );
  });

  it('never reports a final total or fits_budget when a room is unselected', async () => {
    const { service, project } = setup();
    project.rooms.push({
      ...selected,
      id: 'fd98a455-e6f8-447b-ac4c-81a64eb618de',
      publication: null as never,
      publicationKey: null as never,
    });
    const result = await service.budget(7, 1);
    expect(result).toMatchObject({
      status: 'partial',
      total_rooms: 2,
      uncalculable_rooms: 1,
      calculable_subtotal_clp: 60_000,
      total_cost_clp: null,
      fits_budget: null,
      budget_difference_clp: null,
      budget_excess_clp: null,
      unselected_room_ids: ['fd98a455-e6f8-447b-ac4c-81a64eb618de'],
    });
  });

  it('does not call FastAPI or invent a zero-cost budget for an empty project', async () => {
    const { service, project, calculateBudget } = setup();
    project.rooms = [];
    const result = await service.budget(7, 1);
    expect(result).toMatchObject({
      status: 'uncalculable',
      total_rooms: 0,
      total_cost_clp: null,
      fits_budget: null,
    });
    expect(calculateBudget).not.toHaveBeenCalled();
  });

  it('keeps the legacy demo helper JSON-safe and lists only the authenticated owner', async () => {
    const { service, prisma } = setup();
    const demo = await service.create('Demo');
    expect(() => JSON.stringify(demo)).not.toThrow();
    await service.findAll(7);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 7 } }),
    );
  });

  it.each([-1, 0, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'rejects invalid database identifiers %s',
    async (id) => {
      const { service, prisma } = setup();
      await expect(service.findOne(7, id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
    },
  );
});

describe('surface mode', () => {
  it('requires exactly one complete surface input', () => {
    expect(() => surfaceData({ name: 'A', areaMode: 'area' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      surfaceData({
        name: 'A',
        areaMode: 'area',
        areaM2: '10',
        lengthM: '2',
        widthM: '5',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      surfaceData({ name: 'A', areaMode: 'dimensions', lengthM: '2' }),
    ).toThrow(BadRequestException);
    expect(
      surfaceData({
        name: 'A',
        areaMode: 'dimensions',
        lengthM: '2',
        widthM: '5',
      }),
    ).toEqual({
      areaMode: 'dimensions',
      areaM2: null,
      lengthM: '2',
      widthM: '5',
    });
  });

  it('replaces previous area when changing to dimensions in a single patch', () => {
    expect(
      surfaceData(
        { areaMode: 'dimensions', lengthM: '4', widthM: '3' },
        selected,
      ),
    ).toEqual({
      areaMode: 'dimensions',
      areaM2: null,
      lengthM: '4',
      widthM: '3',
    });
  });
});
