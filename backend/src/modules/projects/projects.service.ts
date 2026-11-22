import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service.js';
import {
  Prisma,
  type Project,
  type ProjectFloorplan,
  type Room,
} from '../../generated/prisma/client.js';
import type { FloorSuggestionRequest } from '../../integrations/python/floor-suggestions-contract.js';
import { internalPythonToken } from '../../integrations/python/internal-python-token.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { CATALOGUE_IMPORT_LOCK } from '../materials/capture-contract.js';
import { serializePublication } from '../materials/publication-view.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import type { ProjectFloorDto } from './dto/project-floor.dto.js';
import type { ProjectFloorplanDto } from './dto/project-floorplan.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';
import type {
  AcceptFloorSuggestionDto,
  UpdateFloorPreferencesDto,
  UpdateSuggestionSettingsDto,
} from './dto/suggestions.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import {
  quoteTermsDigest,
  snapshotPublication,
  snapshotRoom,
  suggestionView,
  validQuote,
} from './floor-suggestion-view.js';

type RoomWithPublication = Prisma.RoomGetPayload<{
  include: { publication: true };
}>;
type ProjectWithRooms = Project & {
  rooms?: RoomWithPublication[];
  floorplan?: Pick<ProjectFloorplan, 'name' | 'svg' | 'revision'> | null;
};

const missingProject = () => new NotFoundException('Proyecto no encontrado');
const missingRoom = () => new NotFoundException('Habitación no encontrada');
const suggestionNotFound = () =>
  new NotFoundException({
    code: 'room_not_found',
    message: 'No se encontró la habitación',
  });
const unavailablePublication = () =>
  new ConflictException({
    code: 'publication_unavailable',
    message: 'La publicación ya no está disponible para sugerencias',
  });

function projectId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new BadRequestException('Identificador de proyecto inválido');
  }
}

function serializeRoom(room: RoomWithPublication) {
  return {
    id: room.id,
    projectId: room.projectId,
    name: room.name,
    areaMode: room.areaMode,
    areaM2: room.areaM2?.toString() ?? null,
    lengthM: room.lengthM?.toString() ?? null,
    widthM: room.widthM?.toString() ?? null,
    wastePercent: room.wastePercent.toString(),
    budgetClp: room.budgetClp === null ? null : Number(room.budgetClp),
    publicationKey: room.publicationKey,
    lastSuggestedPublicationKey: room.lastSuggestedPublicationKey ?? null,
    sceneRoomId: room.sceneRoomId,
    preferredCategory: room.preferredCategory,
    preferredSource: room.preferredSource,
    publication: room.publication
      ? serializePublication(room.publication)
      : null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function serializeProject(project: ProjectWithRooms) {
  return {
    id: project.id,
    name: project.name,
    budgetClp: Number(project.budgetClp),
    suggestionsEnabled: project.suggestionsEnabled,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    ...(project.rooms ? { rooms: project.rooms.map(serializeRoom) } : {}),
    ...(project.floorplan !== undefined ? { floorplan: project.floorplan } : {}),
  };
}

/** A change of surface mode replaces the previous mode atomically. */
export function surfaceData(
  dto: CreateRoomDto | UpdateRoomDto,
  previous?: Room,
) {
  const mode = dto.areaMode ?? previous?.areaMode;
  const changedMode =
    previous !== undefined &&
    dto.areaMode !== undefined &&
    dto.areaMode !== previous.areaMode;
  const area =
    dto.areaM2 !== undefined
      ? dto.areaM2
      : changedMode
        ? null
        : previous?.areaM2?.toString();
  const length =
    dto.lengthM !== undefined
      ? dto.lengthM
      : changedMode
        ? null
        : previous?.lengthM?.toString();
  const width =
    dto.widthM !== undefined
      ? dto.widthM
      : changedMode
        ? null
        : previous?.widthM?.toString();

  if (mode === 'area') {
    if (
      area === null ||
      area === undefined ||
      (length !== null && length !== undefined) ||
      (width !== null && width !== undefined)
    ) {
      throw new BadRequestException('En modalidad area indique solo areaM2');
    }
    return {
      areaMode: 'area',
      areaM2: String(area),
      lengthM: null,
      widthM: null,
    };
  }
  if (mode === 'dimensions') {
    if (
      length === null ||
      length === undefined ||
      width === null ||
      width === undefined ||
      (area !== null && area !== undefined)
    ) {
      throw new BadRequestException(
        'En modalidad dimensions indique solo lengthM y widthM',
      );
    }
    return {
      areaMode: 'dimensions',
      areaM2: null,
      lengthM: String(length),
      widthM: String(width),
    };
  }
  throw new BadRequestException('Indique la modalidad de superficie');
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly python: PythonService,
  ) {}

  /** Compatibility for the explicitly fictitious EP1 preview, never a private EP2 project. */
  async create(name: string) {
    return serializeProject(
      await this.prisma.project.create({ data: { name } }),
    );
  }

  async createForUser(userId: number, dto: CreateProjectDto) {
    return serializeProject(
      await this.prisma.project.create({
        data: {
          name: dto.name,
          budgetClp: BigInt(dto.budgetClp),
          ownerId: userId,
        },
      }),
    );
  }

  async findAll(userId: number) {
    const projects = await this.prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return projects.map(serializeProject);
  }

  private async owned(
    tx: Prisma.TransactionClient,
    userId: number,
    id: number,
    inaccessible = missingProject,
  ) {
    projectId(id);
    // A project row lock serializes mutations, including room additions and deletions.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Project" WHERE id = ${id} AND "ownerId" = ${userId} FOR UPDATE
    `;
    if (!locked.length) throw inaccessible();
    const project = await tx.project.findFirst({
      where: { id, ownerId: userId },
    });
    if (!project) throw inaccessible();
    return project;
  }

  async findOne(userId: number, id: number) {
    projectId(id);
    const project = await this.prisma.$transaction(
      (tx) => tx.project.findFirst({
        where: { id, ownerId: userId },
        include: {
          floorplan: { select: { name: true, svg: true, revision: true } },
          rooms: {
            include: { publication: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!project) throw missingProject();
    return serializeProject(project);
  }

  async saveFloorplan(userId: number, id: number, dto: ProjectFloorplanDto) {
    if (
      Buffer.byteLength(dto.svg) > 1_048_576 ||
      /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(dto.svg) ||
      !/<svg[\s>]/.test(dto.svg) ||
      !/<\/svg\s*>/.test(dto.svg)
    ) {
      throw new BadRequestException('El plano debe ser un SVG CubiCasa de hasta 1 MB.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      const previous = await tx.projectFloorplan.findUnique({ where: { projectId: id } });
      const changed = previous?.svg !== dto.svg;
      if (changed) {
        // Parsed room IDs depend on the drawing. Old IDs cannot safely identify rooms in a new drawing.
        await tx.room.updateMany({
          where: { projectId: id, sceneRoomId: { not: null } },
          data: { sceneRoomId: null },
        });
      }
      if (changed && !(await tx.room.count({ where: { projectId: id } }))) {
        await tx.room.createMany({
          data: dto.rooms.map((room) => ({
            projectId: id,
            name: room.name,
            sceneRoomId: room.id,
            areaMode: 'area',
            areaM2: room.areaM2,
          })),
        });
      }
      const { name, svg } = dto;
      const revision = !changed && previous ? previous.revision : randomUUID();
      const floorplan = await tx.projectFloorplan.upsert({
        where: { projectId: id },
        create: { projectId: id, name, svg, revision },
        update: { name, svg, revision },
        select: { name: true, svg: true, revision: true },
      });
      return { floorplan };
    });
  }

  async update(userId: number, id: number, dto: UpdateProjectDto) {
    if (dto.name === undefined && dto.budgetClp === undefined) {
      throw new BadRequestException('Indique nombre o presupuesto');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      return serializeProject(
        await tx.project.update({
          where: { id, ownerId: userId },
          data: {
            name: dto.name,
            ...(dto.budgetClp !== undefined
              ? { budgetClp: BigInt(dto.budgetClp) }
              : {}),
          },
        }),
      );
    });
  }

  async remove(userId: number, id: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      await tx.project.delete({ where: { id, ownerId: userId } });
    });
  }

  private async selectedPublication(
    tx: Prisma.TransactionClient,
    key: string | null | undefined,
  ) {
    if (!key) return;
    if (
      !(await tx.publication.findUnique({
        where: { publicationKey: key },
        select: { publicationKey: true },
      }))
    ) {
      throw new BadRequestException(
        'La publicación seleccionada no existe en el catálogo',
      );
    }
  }

  private async checkFloorplanRevision(tx: Prisma.TransactionClient, id: number, revision?: string) {
    const floorplan = await tx.projectFloorplan.findUnique({
      where: { projectId: id },
      select: { revision: true },
    });
    if (floorplan?.revision !== revision) {
      throw new ConflictException({ code: 'floorplan_changed', message: 'El plano cambió. Abre el proyecto nuevamente.' });
    }
  }

  async createRoom(userId: number, id: number, dto: CreateRoomDto) {
    const surface = surfaceData(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      if (dto.sceneRoomId) await this.checkFloorplanRevision(tx, id, dto.floorplanRevision);
      if ((await tx.room.count({ where: { projectId: id } })) >= 100) {
        throw new BadRequestException(
          'Un proyecto admite hasta 100 habitaciones',
        );
      }
      await this.selectedPublication(tx, dto.publicationKey);
      const room = await tx.room.create({
        data: {
          projectId: id,
          name: dto.name,
          ...surface,
          wastePercent: String(dto.wastePercent ?? '10'),
          budgetClp:
            dto.budgetClp === undefined || dto.budgetClp === null
              ? null
              : BigInt(dto.budgetClp),
          publicationKey: dto.publicationKey ?? null,
          sceneRoomId: dto.sceneRoomId ?? null,
        },
        include: { publication: true },
      });
      return serializeRoom(room);
    });
  }

  async applyProjectFloor(userId: number, id: number, dto: ProjectFloorDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      await this.checkFloorplanRevision(tx, id, dto.floorplanRevision);
      const product = await tx.publication.findUnique({
        where: { publicationKey: dto.publicationKey },
      });
      if (
        !product ||
        product.availability === 'unavailable' ||
        product.saleUnit !== 'box' ||
        product.pricePerBoxClp <= 0 ||
        !product.coveragePerBoxM2?.gt(0)
      ) {
        throw new BadRequestException(
          'Elige un piso disponible con precio y cobertura por caja',
        );
      }
      const existing = await tx.room.findMany({
        where: { projectId: id },
        select: { sceneRoomId: true },
      });
      const planIds = new Set(dto.rooms.map((room) => room.id));
      const attached = existing.flatMap((room) =>
        room.sceneRoomId && planIds.has(room.sceneRoomId)
          ? [room.sceneRoomId]
          : [],
      );
      const linked = new Set(attached);
      if (linked.size !== attached.length) {
        throw new BadRequestException(
          'Corrige los recintos vinculados a más de una habitación',
        );
      }
      const missing = dto.rooms.filter((room) => !linked.has(room.id));
      if (existing.length + missing.length > 100)
        throw new BadRequestException(
          'Un proyecto admite hasta 100 habitaciones',
        );
      if (missing.length)
        await tx.room.createMany({
          data: missing.map((room) => ({
            projectId: id,
            sceneRoomId: room.id,
            name: room.name,
            areaMode: 'area',
            areaM2: String(room.areaM2),
            publicationKey: dto.publicationKey,
          })),
        });
      if (linked.size)
        await tx.room.updateMany({
          where: {
            projectId: id,
            sceneRoomId: { in: [...linked] },
            OR: [
              { publicationKey: null },
              { publicationKey: { not: dto.publicationKey } },
            ],
          },
          data: { publicationKey: dto.publicationKey },
        });
      const project = await tx.project.findUniqueOrThrow({
        where: { id },
        include: {
          rooms: {
            include: { publication: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
      return serializeProject(project);
    });
  }

  async updateRoom(
    userId: number,
    id: number,
    roomId: string,
    dto: UpdateRoomDto,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('Indique algún campo de la habitación');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      const room = await tx.room.findFirst({
        where: { id: roomId, projectId: id },
      });
      if (!room) throw missingRoom();
      const surface = surfaceData(dto, room);
      if (dto.sceneRoomId) await this.checkFloorplanRevision(tx, id, dto.floorplanRevision);
      await this.selectedPublication(tx, dto.publicationKey);
      return serializeRoom(
        await tx.room.update({
          where: { id: roomId, projectId: id },
          data: {
            name: dto.name,
            ...surface,
            ...(dto.wastePercent !== undefined
              ? { wastePercent: String(dto.wastePercent) }
              : {}),
            ...(dto.budgetClp !== undefined
              ? {
                  budgetClp:
                    dto.budgetClp === null ? null : BigInt(dto.budgetClp),
                }
              : {}),
            ...(dto.publicationKey !== undefined
              ? { publicationKey: dto.publicationKey }
              : {}),
            ...(dto.sceneRoomId !== undefined
              ? { sceneRoomId: dto.sceneRoomId }
              : {}),
          },
          include: { publication: true },
        }),
      );
    });
  }

  async removeRoom(userId: number, id: number, roomId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      const deleted = await tx.room.deleteMany({
        where: { id: roomId, projectId: id },
      });
      if (!deleted.count) throw missingRoom();
    });
  }

  async updateSuggestionSettings(
    userId: number,
    id: number,
    dto: UpdateSuggestionSettingsDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      return tx.project.update({
        where: { id },
        data: dto,
        select: { suggestionsEnabled: true },
      });
    });
  }

  async updateFloorPreferences(
    userId: number,
    id: number,
    roomId: string,
    dto: UpdateFloorPreferencesDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id, suggestionNotFound);
      const room = await tx.room.findFirst({
        where: { id: roomId, projectId: id },
      });
      if (!room) throw suggestionNotFound();
      return serializeRoom(
        await tx.room.update({
          where: { id: roomId, projectId: id },
          data: dto,
          include: { publication: true },
        }),
      );
    });
  }

  async suggestions(
    userId: number,
    id: number,
    roomId: string,
    exclude: string[],
    requestId?: string,
  ) {
    projectId(id);
    const context = await this.prisma.$transaction(
      (tx) => this.suggestionContext(tx, userId, id, roomId),
      { isolationLevel: 'RepeatableRead' },
    );
    const input = { ...context.input, exclude };
    const result = await this.python.recommendFloors(input, requestId);
    const secret = internalPythonToken();
    return {
      availableBudgetClp: result.available_budget_clp,
      provisionalBudget: result.provisional_budget,
      emptyReason: result.empty_reason,
      suggestions: result.suggestions.map((item) =>
        suggestionView(input, item, userId, id, secret, context.photoUrls.get(item.publication_key) ?? null),
      ),
    };
  }

  async acceptSuggestion(
    userId: number,
    id: number,
    roomId: string,
    dto: AcceptFloorSuggestionDto,
    requestId?: string,
  ) {
    projectId(id);
    const key = dto.publicationKey;

    // The Python calculation stays outside the SQL transaction. Recheck all price inputs
    // at save time while project and catalogue rows are locked against concurrent writes.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { input, photoUrls } = await this.prisma.$transaction(
        (tx) => this.suggestionContext(tx, userId, id, roomId, key),
        { isolationLevel: 'RepeatableRead' },
      );
      const secret = internalPythonToken();
      if (!validQuote(secret, userId, id, roomId, key, dto.quoteId)) {
        throw new BadRequestException({
          code: 'invalid_recommendation_request',
          message: 'La cotización no es válida para esta habitación',
        });
      }
      if (!input.publications.length) throw unavailablePublication();
      const result = await this.python.recommendFloors(input, requestId);
      const ranked = result.suggestions[0];
      if (!ranked) throw unavailablePublication();
      const quote = suggestionView(input, ranked, userId, id, secret, photoUrls.get(key) ?? null);
      if (quote.quoteId !== dto.quoteId)
        throw new ConflictException({ status: 'price_changed', quote });
      const hash = quoteTermsDigest(input, key);
      const accepted = await this.prisma.$transaction(async (tx) => {
        await this.owned(tx, userId, id, suggestionNotFound);
        // Capture imports can update several publications at once. Coordinate with their
        // exclusive lock before taking row locks, while letting other acceptances proceed.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(${CATALOGUE_IMPORT_LOCK})::text AS locked`;
        const watched = await tx.room.findMany({
          where: { projectId: id, id: { not: roomId } },
          select: { publicationKey: true },
        });
        const keys = [
          ...new Set([
            key,
            ...watched.flatMap((room) =>
              room.publicationKey ? [room.publicationKey] : [],
            ),
          ]),
        ];
        await tx.$queryRaw`SELECT "publicationKey" FROM "Publication"
          WHERE "publicationKey" IN (${Prisma.join(keys)}) ORDER BY "publicationKey" FOR SHARE`;
        const current = await this.suggestionContext(
          tx,
          userId,
          id,
          roomId,
          key,
        );
        if (
          !current.input.publications.length ||
          quoteTermsDigest(current.input, key) !== hash
        )
          return null;
        if (current.room.publicationKey === key && current.room.lastSuggestedPublicationKey === key)
          return serializeRoom(current.room);
        const room = await tx.room.update({
          where: { id: roomId, projectId: id },
          data: { publicationKey: key, lastSuggestedPublicationKey: key },
          include: { publication: true },
        });
        return serializeRoom(room);
      });
      if (accepted) return { status: 'accepted', room: accepted };
    }
    throw new ServiceUnavailableException({
      code: 'recommendations_unavailable',
      message: 'El catálogo está cambiando. Vuelve a consultar las sugerencias',
    });
  }

  private async suggestionContext(
    tx: Prisma.TransactionClient,
    userId: number,
    id: number,
    roomId: string,
    selected?: string,
  ) {
    const project = await tx.project.findFirst({
      where: { id, ownerId: userId },
      include: {
        rooms: { include: { publication: true }, orderBy: { id: 'asc' } },
      },
    });
    const target = project?.rooms.find((room) => room.id === roomId);
    if (!project || !target) throw suggestionNotFound();
    if (!project.suggestionsEnabled)
      throw new ConflictException({
        code: 'suggestions_disabled',
        message: 'Las sugerencias están desactivadas',
      });
    const candidates = await tx.publication.findMany({
      where: {
        ...(selected ? { publicationKey: selected } : {}),
        category: { in: ['ceramic', 'laminate'] },
        source: { in: ['easy', 'sodimac'] },
        currency: 'CLP',
        priceType: 'public',
        saleUnit: 'box',
        communeCode: '13110',
        pricePerBoxClp: { gt: 0 },
        coveragePerBoxM2: { gt: 0 },
      },
      orderBy: [{ checkedAt: 'desc' }, { publicationKey: 'asc' }],
      take: 40,
    });
    const input: FloorSuggestionRequest = {
      budget_clp: Number(project.budgetClp),
      room: {
        ...snapshotRoom(target),
        preferred_category: target.preferredCategory,
        preferred_source: target.preferredSource,
      },
      other_rooms: project.rooms
        .filter((room) => room.id !== roomId)
        .map((room) => ({
          ...snapshotRoom(room),
          publication:
            room.publication?.saleUnit === 'box'
              ? snapshotPublication(room.publication)
              : null,
        })),
      publications: candidates.map((item) => ({
        ...snapshotPublication(item),
        name: item.name,
        category: item.category,
      })),
      ...(selected ? { selected_publication_key: selected } : {}),
    };
    return { room: target, input, photoUrls: new Map(candidates.map(item => [item.publicationKey, item.imageUrl])) };
  }

  async budget(userId: number, id: number, requestId?: string) {
    projectId(id);
    // All room selections and prices belong to the same DB snapshot. No DB transaction spans HTTP.
    const project = await this.prisma.$transaction(
      async (tx) => {
        const found = await tx.project.findFirst({
          where: { id, ownerId: userId },
          include: {
            rooms: {
              include: { publication: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        });
        if (!found) throw missingProject();
        return found;
      },
      { isolationLevel: 'RepeatableRead' },
    );

    const unselected = project.rooms
      .filter((room) => room.publication === null)
      .map((room) => room.id);
    const rooms = project.rooms.flatMap((room) => {
      const publication = room.publication;
      if (!publication) return [];
      return [
        {
          ...snapshotRoom(room),
          publication: snapshotPublication(publication),
        },
      ];
    });
    const common = {
      project_id: project.id,
      total_rooms: project.rooms.length,
      unselected_room_ids: unselected,
      calculation_basis: 'latest_persisted_publications',
    };
    if (!rooms.length) {
      return {
        ...common,
        currency: 'CLP',
        status: 'uncalculable',
        rooms: [],
        calculated_rooms: 0,
        uncalculable_rooms: unselected.length,
        calculable_subtotal_clp: 0,
        total_cost_clp: null,
        budget_clp: Number(project.budgetClp),
        budget_difference_clp: null,
        budget_excess_clp: null,
        fits_budget: null,
        scope: 'floor_boxes_only',
      };
    }
    const result = await this.python.calculateBudget(
      { rooms, budget_clp: Number(project.budgetClp) },
      requestId,
    );
    if (unselected.length) {
      return {
        ...result,
        ...common,
        status: result.calculated_rooms ? 'partial' : 'uncalculable',
        uncalculable_rooms: result.uncalculable_rooms + unselected.length,
        total_cost_clp: null,
        budget_difference_clp: null,
        budget_excess_clp: null,
        fits_budget: null,
      };
    }
    return { ...result, ...common };
  }
}
