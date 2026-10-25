import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Publication } from '../../generated/prisma/client.js';

import {
  captureHash,
  chileDisplay,
  validateCapture,
} from './capture-contract.js';
import type { CapturedPublication, CaptureGroup } from './capture-contract.js';
import { CatalogQueryDto, PageQueryDto } from './materials.dto.js';
import { serializePublication } from './publication-view.js';

function publicationData(p: CapturedPublication, runId: string) {
  return {
    publicationKey: p.publication_key,
    source: p.source,
    externalId: p.external_id,
    sku: p.sku,
    seller: p.seller,
    name: p.name,
    brand: p.brand,
    category: p.category,
    productUrl: p.product_url,
    imageUrl: p.image_url,
    currency: p.currency,
    priceType: p.price_type,
    pricePerBoxClp: p.price_per_box_clp,
    saleUnit: p.sale_unit,
    coveragePerBoxM2: p.coverage_per_box_m2,
    pricePerM2Clp: p.price_per_m2_clp,
    reportedPriceM2Clp: p.reported_price_m2_clp,
    availability: p.availability,
    communeCode: p.commune_code,
    commune: p.commune,
    region: p.region,
    checkedAt: new Date(p.checked_at),
    promotions: p.promotions,
    evidence: p.evidence,
    extractorVersion: p.extractor_version,
    lastRunId: runId,
  };
}

function sameTerms(previous: Publication, next: CapturedPublication): boolean {
  const oldCoverage = previous.coveragePerBoxM2;
  const newCoverage = next.coverage_per_box_m2;
  return (
    previous.pricePerBoxClp === next.price_per_box_clp &&
    previous.saleUnit === next.sale_unit &&
    (oldCoverage === null
      ? newCoverage === null
      : newCoverage !== null && oldCoverage.equals(newCoverage))
  );
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async importCapture(payload: unknown) {
    const capture = validateCapture(payload);
    const hash = captureHash(capture);
    return this.prisma.$transaction(
      async (tx) => {
        // A transaction-level lock serializes imports across all backend instances.
        // It is distinct from the acquisition lock, so no transaction is held during HTTP.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(72634103)::text AS locked`;
        const prior = await tx.captureRun.findUnique({
          where: { runId: capture.run_id },
        });
        if (prior) {
          if (prior.payloadHash !== hash)
            throw new ConflictException(
              'El identificador de captura ya contiene otro resultado',
            );
          return {
            runId: prior.runId,
            status: prior.status,
            replayed: true,
            updatedCount: prior.updatedCount,
            retainedCount: prior.retainedCount,
          };
        }
        await tx.captureRun.create({
          data: {
            runId: capture.run_id,
            schemaVersion: capture.schema_version,
            origin: capture.origin,
            trigger: capture.trigger,
            scheduledFor: capture.scheduled_for
              ? new Date(capture.scheduled_for)
              : null,
            startedAt: new Date(capture.started_at),
            finishedAt: new Date(capture.finished_at),
            status: capture.status,
            requestId: capture.request_id,
            groups: capture.groups as unknown as Prisma.InputJsonValue,
            payloadHash: hash,
            publicationCount: capture.publications.length,
            updatedCount: 0,
            retainedCount: capture.retained_publication_keys.length,
          },
        });
        const selected = new Set(capture.updated_publication_keys);
        const staleKeys: string[] = [];
        let updatedCount = 0;
        for (const publication of capture.publications) {
          if (!selected.has(publication.publication_key)) continue;
          const previous = await tx.publication.findUnique({
            where: { publicationKey: publication.publication_key },
          });
          const stamp = new Date(publication.checked_at);
          if (previous && previous.checkedAt.getTime() >= stamp.getTime()) {
            if (
              previous.checkedAt.getTime() === stamp.getTime() &&
              !sameTerms(previous, publication)
            ) {
              throw new ConflictException(
                'Dos precios distintos comparten la misma fecha de comprobación',
              );
            }
            staleKeys.push(publication.publication_key);
            continue;
          }
          const data = publicationData(publication, capture.run_id);
          if (previous)
            await tx.publication.update({
              where: { publicationKey: publication.publication_key },
              data,
            });
          else await tx.publication.create({ data });
          if (!previous || !sameTerms(previous, publication)) {
            await tx.priceObservation.create({
              data: {
                publicationKey: publication.publication_key,
                runId: capture.run_id,
                observedAt: stamp,
                pricePerBoxClp: publication.price_per_box_clp,
                coveragePerBoxM2: publication.coverage_per_box_m2,
                pricePerM2Clp: publication.price_per_m2_clp,
                saleUnit: publication.sale_unit,
                changeType: previous ? 'price_or_pack_change' : 'initial',
              },
            });
          }
          updatedCount++;
        }
        for (const group of capture.groups) {
          const count = await tx.publication.count({
            where: { source: group.source, category: group.category },
          });
          if (count > 10)
            throw new ConflictException(
              'La muestra persistida admite hasta diez publicaciones por tienda y categoría; conserve sus identificadores',
            );
        }
        const retainedCount =
          capture.retained_publication_keys.length + staleKeys.length;
        await tx.captureRun.update({
          where: { runId: capture.run_id },
          data: { updatedCount, retainedCount },
        });
        return {
          runId: capture.run_id,
          status: capture.status,
          replayed: false,
          updatedCount,
          retainedCount,
          staleKeys,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  async catalogue(query: CatalogQueryDto) {
    const { page, limit } = query;
    const range: Prisma.DecimalFilter = {};
    if (query.minPricePerM2 !== undefined)
      range.gte = new Prisma.Decimal(query.minPricePerM2);
    if (query.maxPricePerM2 !== undefined)
      range.lte = new Prisma.Decimal(query.maxPricePerM2);
    if (
      range.gte !== undefined &&
      range.lte !== undefined &&
      new Prisma.Decimal(range.gte.toString()).gt(range.lte.toString())
    ) {
      throw new BadRequestException(
        'El precio mínimo no puede superar el máximo',
      );
    }
    const where: Prisma.PublicationWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(Object.keys(range).length ? { pricePerM2Clp: range } : {}),
    };
    const [total, rows] = await this.prisma.$transaction(
      [
        this.prisma.publication.count({ where }),
        this.prisma.publication.findMany({
          where,
          orderBy: { publicationKey: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const attempts = await this.latestGroupAttempts();
    return {
      items: rows.map((row) => ({
        ...serializePublication(row),
        lastAttempt: attempts[`${row.source}/${row.category}`],
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(publicationKey: string) {
    this.assertKey(publicationKey);
    const item = await this.prisma.publication.findUnique({
      where: { publicationKey },
    });
    if (!item) throw new NotFoundException('Publicación no encontrada');
    const attempts = await this.latestGroupAttempts();
    return {
      ...serializePublication(item),
      lastAttempt: attempts[`${item.source}/${item.category}`],
    };
  }

  async history(publicationKey: string, query: PageQueryDto) {
    this.assertKey(publicationKey);
    const publication = await this.prisma.publication.findUnique({
      where: { publicationKey },
    });
    if (!publication) throw new NotFoundException('Publicación no encontrada');
    const where = { publicationKey };
    const [total, rows] = await this.prisma.$transaction(
      [
        this.prisma.priceObservation.count({ where }),
        this.prisma.priceObservation.findMany({
          where,
          orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      publicationKey,
      currency: publication.currency,
      priceType: publication.priceType,
      seller: publication.seller,
      communeCode: publication.communeCode,
      items: rows.map((row) => ({
        ...row,
        observedAt: row.observedAt.toISOString(),
        observedDisplay: chileDisplay(row.observedAt),
        coveragePerBoxM2: row.coveragePerBoxM2?.toString() ?? null,
        pricePerM2Clp: row.pricePerM2Clp?.toString() ?? null,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async status() {
    const [publicationCount, latestRun, latestJob, groups] = await Promise.all([
      this.prisma.publication.count(),
      this.prisma.captureRun.findFirst({
        orderBy: [{ finishedAt: 'desc' }, { runId: 'desc' }],
        select: {
          runId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          updatedCount: true,
          retainedCount: true,
        },
      }),
      this.prisma.captureJob.findFirst({
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          scheduledFor: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          runId: true,
          errorCode: true,
        },
      }),
      this.latestGroupAttempts(),
    ]);
    return {
      storage: 'postgresql',
      publicationCount,
      latestRun,
      latestJob,
      groups: Object.values(groups),
      schedule: {
        timezone: 'America/Santiago',
        hours: [8, 12, 16],
        enabled: process.env.MATERIALS_SCHEDULE_ENABLED === 'true',
      },
      serverTime: new Date().toISOString(),
    };
  }

  private async latestGroupAttempts() {
    const entries = await Promise.all(
      ['sodimac', 'easy'].flatMap((source) =>
        ['ceramic', 'laminate'].map(async (category) => {
          const run = await this.prisma.captureRun.findFirst({
            where: { groups: { array_contains: [{ source, category }] } },
            orderBy: [{ finishedAt: 'desc' }, { runId: 'desc' }],
            select: { runId: true, finishedAt: true, groups: true },
          });
          const group =
            run &&
            (run.groups as unknown as CaptureGroup[]).find(
              (g) => g.source === source && g.category === category,
            );
          return [
            `${source}/${category}`,
            {
              source,
              category,
              status: group?.status ?? 'not_attempted',
              runId: run?.runId ?? null,
              finishedAt: run?.finishedAt.toISOString() ?? null,
              metrics: group?.metrics ?? null,
              errors: group?.errors ?? [],
              warnings: group?.warnings ?? [],
              missingPublicationKeys: group?.missing_publication_keys ?? [],
            },
          ] as const;
        }),
      ),
    );
    return Object.fromEntries(entries);
  }

  private assertKey(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key))
      throw new BadRequestException('Identificador de publicación inválido');
  }
}
