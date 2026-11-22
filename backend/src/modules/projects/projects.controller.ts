import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { AuthenticatedRequest } from '../auth/session-auth.guard.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import {
  AcceptFloorSuggestionDto,
  AcceptFloorSuggestionResponseDto,
  FloorSuggestionsQueryDto,
  FloorSuggestionsResponseDto,
} from './dto/floor-suggestions.dto.js';
import { PreviewProjectDto } from './dto/preview-project.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectPreviewService } from './project-preview.service.js';
import { ProjectsService } from './projects.service.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly previews: ProjectPreviewService,
  ) {}

  @Post('preview')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  preview(
    @Body() dto: PreviewProjectDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const requestId = request.headers['x-request-id'];
    return this.previews.create(
      dto,
      typeof requestId === 'string' ? requestId : undefined,
    );
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateProjectDto) {
    return this.projects.createForUser(request.authenticatedUser.id, dto);
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.projects.findAll(request.authenticatedUser.id);
  }

  @Get(':id/budget')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  budget(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const requestId = request.headers['x-request-id'];
    return this.projects.budget(
      request.authenticatedUser.id,
      id,
      typeof requestId === 'string' ? requestId : undefined,
    );
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projects.findOne(request.authenticatedUser.id, id);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(request.authenticatedUser.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projects.remove(request.authenticatedUser.id, id);
  }

  @Post(':id/rooms')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  createRoom(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRoomDto,
  ) {
    return this.projects.createRoom(request.authenticatedUser.id, id, dto);
  }

  @Patch(':id/rooms/:roomId')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  updateRoom(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.projects.updateRoom(
      request.authenticatedUser.id,
      id,
      roomId,
      dto,
    );
  }

  @Delete(':id/rooms/:roomId')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  removeRoom(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
  ) {
    return this.projects.removeRoom(request.authenticatedUser.id, id, roomId);
  }

  @Get(':id/rooms/:roomId/suggestions')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Calcular sugerencias de piso con el catálogo persistido',
  })
  @ApiQuery({
    name: 'exclude',
    required: false,
    type: String,
    description: 'Hasta 40 claves de publicación SHA-256 separadas por comas',
  })
  @ApiOkResponse({ type: FloorSuggestionsResponseDto })
  @ApiUnauthorizedResponse({ description: 'Sesión ausente o vencida' })
  @ApiServiceUnavailableResponse({
    description: 'Servicio Python no disponible',
  })
  @ApiNotFoundResponse({
    description: 'Proyecto o habitación no encontrado para esta cuenta',
  })
  suggestions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
    @Query() query: FloorSuggestionsQueryDto,
  ) {
    const requestId = request.headers['x-request-id'];
    return this.projects.suggestions(
      request.authenticatedUser.id,
      id,
      roomId,
      query.exclude?.split(',') ?? [],
      typeof requestId === 'string' ? requestId : undefined,
    );
  }

  @Post(':id/rooms/:roomId/suggestions/accept')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verificar el costo vigente antes de guardar el piso sugerido',
  })
  @ApiOkResponse({ type: AcceptFloorSuggestionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Sesión ausente o vencida' })
  @ApiServiceUnavailableResponse({
    description: 'Servicio Python no disponible',
  })
  @ApiNotFoundResponse({
    description: 'Proyecto o habitación no encontrado para esta cuenta',
  })
  @ApiConflictResponse({
    description:
      'Sugerencias desactivadas, publicación no utilizable o cambio concurrente',
  })
  acceptSuggestion(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
    @Body() dto: AcceptFloorSuggestionDto,
  ) {
    const requestId = request.headers['x-request-id'];
    return this.projects.acceptSuggestion(
      request.authenticatedUser.id,
      id,
      roomId,
      dto,
      typeof requestId === 'string' ? requestId : undefined,
    );
  }
}
