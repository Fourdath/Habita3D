import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type {
  Project,
  Publication,
  Room,
  Prisma,
} from '../../generated/prisma/client.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { serializePublication } from '../materials/publication-view.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { AcceptFloorSuggestionDto } from './dto/floor-suggestions.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import {
  publicationFloorInput,
  roomBudgetInput,
  roomFloorInput,
} from './project-floor-input.js';

type RoomWithPublication = Prisma.RoomGetPayload<{
  include: { publication: true };
}>;
type ProjectWithRooms = Project & { rooms?: RoomWithPublication[] };

const missingProject = () => new NotFoundException('Proyecto no encontrado');
const missingRoom = () => new NotFoundException('Habitación no encontrada');
const disabledSuggestions = () =>
  new ConflictException({
    code: 'SUGGESTIONS_DISABLED',
    message: 'Las sugerencias están desactivadas para este proyecto',
  });
const unavailableSuggestion = () =>
  new ConflictException({
    code: 'SUGGESTION_UNAVAILABLE',
    message: 'La publicación ya no está disponible para esta sugerencia',
  });
const changedSuggestion = () =>
  new ConflictException({
    code: 'SUGGESTION_CHANGED',
    message:
      'La publicación o la habitación cambió; vuelve a revisar la sugerencia',
  });
const PRICE_STALE_MS = 24 * 60 * 60 * 1000;

function isPriceStale(publication: Publication, now: number) {
  return now - publication.checkedAt.getTime() >= PRICE_STALE_MS;
}

function canRecommend(publication: Publication) {
  return (
    publication.availability !== 'unavailable' &&
    publication.coveragePerBoxM2 !== null
  );
}

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
          suggestionsEnabled: dto.suggestionsEnabled ?? true,
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
  ) {
    projectId(id);
    // A project row lock serializes mutations, including room additions and deletions.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "Project" WHERE id = ${id} AND "ownerId" = ${userId} FOR UPDATE
    `;
    if (!locked.length) throw missingProject();
    const project = await tx.project.findFirst({
      where: { id, ownerId: userId },
    });
    if (!project) throw missingProject();
    return project;
  }

  private async findOwnedWithRooms(
    tx: Prisma.TransactionClient,
    userId: number,
    id: number,
  ) {
    projectId(id);
    const project = await tx.project.findFirst({
      where: { id, ownerId: userId },
      include: {
        rooms: {
          include: { publication: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!project) throw missingProject();
    return project;
  }

  async findOne(userId: number, id: number) {
    return serializeProject(
      await this.findOwnedWithRooms(this.prisma, userId, id),
    );
  }

  async update(userId: number, id: number, dto: UpdateProjectDto) {
    if (
      dto.name === undefined &&
      dto.budgetClp === undefined &&
      dto.suggestionsEnabled === undefined
    ) {
      throw new BadRequestException('Indique algún campo del proyecto');
    }
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
      return serializeProject(
        await tx.project.update({
          where: { id, ownerId: userId },
          data: {
            name: dto.name,
            suggestionsEnabled: dto.suggestionsEnabled,
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

  async createRoom(userId: number, id: number, dto: CreateRoomDto) {
    const surface = surfaceData(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.owned(tx, userId, id);
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
          preferredCategory: dto.preferredCategory ?? null,
          preferredSource: dto.preferredSource ?? null,
        },
        include: { publication: true },
      });
      return serializeRoom(room);
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
      await this.selectedPublication(tx, dto.publicationKey);
      return serializeRoom(
        await tx.room.update({
          where: { id: roomId, projectId: id },
          data: {
            name: dto.name,
            preferredCategory: dto.preferredCategory,
            preferredSource: dto.preferredSource,
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

  async suggestions(
    userId: number,
    id: number,
    roomId: string,
    excluded: string[],
    requestId?: string,
  ) {
    const { project, room, candidates } = await this.prisma.$transaction(
      async (tx) => {
        const project = await this.findOwnedWithRooms(tx, userId, id);
        const room = project.rooms.find((value) => value.id === roomId);
        if (!room) throw missingRoom();
        const candidates = project.suggestionsEnabled
          ? await tx.publication.findMany({
              where: {
                availability: { not: 'unavailable' },
                coveragePerBoxM2: { not: null },
                publicationKey: { notIn: excluded },
              },
              orderBy: { publicationKey: 'asc' },
              take: 40,
            })
          : [];
        return { project, room, candidates };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    if (!project.suggestionsEnabled) {
      return {
        roomId,
        status: 'disabled' as const,
        ruleVersion: null,
        availableBudgetClp: null,
        budgetProvisional: false,
        items: [],
      };
    }

    // The context and all candidate prices came from one snapshot; no HTTP call holds a lock.
    const otherRooms = project.rooms.filter((value) => value.id !== roomId);
    const selected = otherRooms.flatMap((value) =>
      value.publication ? [roomBudgetInput(value, value.publication)] : [],
    );
    const otherCosts = selected.length
      ? await this.python.calculateBudget(
          { rooms: selected, budget_clp: Number(project.budgetClp) },
          requestId,
        )
      : null;
    const remaining =
      Number(project.budgetClp) - (otherCosts?.calculable_subtotal_clp ?? 0);
    const availableBudgetClp =
      room.budgetClp === null
        ? remaining
        : Math.min(remaining, Number(room.budgetClp));
    const budgetProvisional =
      (otherCosts?.calculated_rooms ?? 0) < otherRooms.length;
    const result = await this.python.recommendFloors(
      {
        ...roomFloorInput(room),
        available_budget_clp: availableBudgetClp,
        preferred_category: room.preferredCategory,
        preferred_source: room.preferredSource,
        candidates: candidates.map((value) => ({
          ...publicationFloorInput(value),
          category: value.category,
        })),
      },
      requestId,
    );
    const publicationByKey = new Map(
      candidates.map((value) => [value.publicationKey, value]),
    );
    const now = Date.now();
    return {
      roomId,
      status: result.status,
      ruleVersion: result.rule_version,
      availableBudgetClp,
      budgetProvisional,
      items: result.items.map((item) => {
        const publication = publicationByKey.get(item.publication_key);
        if (!publication) {
          throw new BadGatewayException(
            'La sugerencia no corresponde al catálogo consultado',
          );
        }
        return {
          publication: serializePublication(publication),
          boxes: item.boxes,
          costClp: item.cost_clp,
          budgetExcessClp: item.budget_excess_clp,
          reasons: item.reasons,
          isPriceStale: isPriceStale(publication, now),
        };
      }),
    };
  }

  async acceptSuggestion(
    userId: number,
    id: number,
    roomId: string,
    dto: AcceptFloorSuggestionDto,
    requestId?: string,
  ) {
    const { room, publication } = await this.prisma.$transaction(
      async (tx) => {
        const project = await this.findOwnedWithRooms(tx, userId, id);
        const room = project.rooms.find((value) => value.id === roomId);
        if (!room) throw missingRoom();
        if (!project.suggestionsEnabled) throw disabledSuggestions();
        const publication = await tx.publication.findUnique({
          where: { publicationKey: dto.publicationKey },
        });
        if (!publication || !canRecommend(publication))
          throw unavailableSuggestion();
        return { room, publication };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const result = await this.python.calculateBudget(
      { rooms: [roomBudgetInput(room, publication)], budget_clp: null },
      requestId,
    );
    const quote = result.rooms[0];
    if (
      !quote ||
      quote.status !== 'calculated' ||
      quote.cost_clp === null ||
      quote.boxes === null
    ) {
      throw new BadGatewayException(
        'No se pudo comprobar el costo de la sugerencia',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const project = await this.owned(tx, userId, id);
      if (!project.suggestionsEnabled) throw disabledSuggestions();
      const currentRoom = await tx.room.findFirst({
        where: { id: roomId, projectId: id },
      });
      if (!currentRoom) throw missingRoom();
      if (
        currentRoom.updatedAt.getTime() !== room.updatedAt.getTime() ||
        currentRoom.publicationKey !== room.publicationKey ||
        JSON.stringify(roomFloorInput(currentRoom)) !==
          JSON.stringify(roomFloorInput(room))
      ) {
        throw changedSuggestion();
      }

      // Keep the price row stable between the final comparison and the choice write.
      await tx.$queryRaw`
        SELECT "publicationKey" FROM "Publication"
        WHERE "publicationKey" = ${publication.publicationKey} FOR SHARE
      `;
      const currentPublication = await tx.publication.findUnique({
        where: { publicationKey: publication.publicationKey },
      });
      if (!currentPublication || !canRecommend(currentPublication))
        throw unavailableSuggestion();
      if (
        currentPublication.pricePerBoxClp !== publication.pricePerBoxClp ||
        currentPublication.coveragePerBoxM2?.toString() !==
          publication.coveragePerBoxM2?.toString() ||
        currentPublication.availability !== publication.availability
      ) {
        throw changedSuggestion();
      }
      const details = {
        boxes: quote.boxes,
        costClp: quote.cost_clp,
        publication: serializePublication(currentPublication),
        isPriceStale: isPriceStale(currentPublication, Date.now()),
      };
      if (quote.cost_clp !== dto.expectedCostClp) {
        return { status: 'price_changed' as const, ...details };
      }
      const updatedRoom = await tx.room.update({
        where: { id: roomId, projectId: id },
        data: { publicationKey: publication.publicationKey },
        include: { publication: true },
      });
      return {
        status: 'accepted' as const,
        ...details,
        room: serializeRoom(updatedRoom),
      };
    });
  }

  async budget(userId: number, id: number, requestId?: string) {
    // All room selections and prices belong to the same DB snapshot. No DB transaction spans HTTP.
    const project = await this.prisma.$transaction(
      (tx) => this.findOwnedWithRooms(tx, userId, id),
      { isolationLevel: 'RepeatableRead' },
    );

    const unselected = project.rooms
      .filter((room) => room.publication === null)
      .map((room) => room.id);
    const rooms = project.rooms.flatMap((room) =>
      room.publication ? [roomBudgetInput(room, room.publication)] : [],
    );
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
