import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { Project, Room, Prisma } from '../../generated/prisma/client.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { serializePublication } from '../materials/publication-view.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';

type RoomWithPublication = Prisma.RoomGetPayload<{
  include: { publication: true };
}>;
type ProjectWithRooms = Project & { rooms?: RoomWithPublication[] };

const missingProject = () => new NotFoundException('Proyecto no encontrado');
const missingRoom = () => new NotFoundException('Habitación no encontrada');

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

  async findOne(userId: number, id: number) {
    projectId(id);
    const project = await this.prisma.project.findFirst({
      where: { id, ownerId: userId },
      include: {
        rooms: {
          include: { publication: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!project) throw missingProject();
    return serializeProject(project);
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
          room_id: room.id,
          ...(room.areaMode === 'area'
            ? { area_m2: room.areaM2!.toString() }
            : {
                length_m: room.lengthM!.toString(),
                width_m: room.widthM!.toString(),
              }),
          waste_percent: room.wastePercent.toString(),
          budget_clp: room.budgetClp === null ? null : Number(room.budgetClp),
          publication: {
            publication_key: publication.publicationKey,
            source: publication.source,
            price_per_box_clp: publication.pricePerBoxClp,
            coverage_per_box_m2:
              publication.coveragePerBoxM2?.toString() ?? null,
            currency: publication.currency,
            price_type: publication.priceType,
            checked_at: publication.checkedAt.toISOString(),
            availability: publication.availability,
          },
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
