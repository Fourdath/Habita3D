import {
  Body,
  Controller,
  Delete,
  Get,
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

import type { AuthenticatedRequest } from '../auth/session-auth.guard.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { PreviewProjectDto } from './dto/preview-project.dto.js';
import { ProjectFloorDto } from './dto/project-floor.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';
import {
  AcceptFloorSuggestionDto,
  SuggestionQueryDto,
  UpdateFloorPreferencesDto,
  UpdateSuggestionSettingsDto,
} from './dto/suggestions.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { floorSuggestionsOpenApi } from './floor-suggestions.openapi.js';
import { ProjectPreviewService } from './project-preview.service.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly previews: ProjectPreviewService,
  ) {}

  @Post('preview')
  preview(@Body() dto: PreviewProjectDto) {
    return this.previews.create(dto);
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateProjectDto) {
    return this.projects.createForUser(request.authenticatedUser.id, dto);
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  findAll(@Req() request: AuthenticatedRequest) {
    return this.projects.findAll(request.authenticatedUser.id);
  }

  @Get(':id/budget')
  @UseGuards(SessionAuthGuard)
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

  @Get('suggestions/openapi.json')
  suggestionsContract() {
    return floorSuggestionsOpenApi;
  }

  @Patch(':id/suggestions/settings')
  @UseGuards(SessionAuthGuard)
  updateSuggestionSettings(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSuggestionSettingsDto,
  ) {
    return this.projects.updateSuggestionSettings(
      request.authenticatedUser.id,
      id,
      dto,
    );
  }

  @Patch(':id/rooms/:roomId/suggestions/preferences')
  @UseGuards(SessionAuthGuard)
  updateFloorPreferences(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
    @Body() dto: UpdateFloorPreferencesDto,
  ) {
    return this.projects.updateFloorPreferences(
      request.authenticatedUser.id,
      id,
      roomId,
      dto,
    );
  }

  @Get(':id/rooms/:roomId/suggestions')
  @UseGuards(SessionAuthGuard)
  suggestions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
    @Query() query: SuggestionQueryDto,
  ) {
    const requestId = request.headers['x-request-id'];
    return this.projects.suggestions(
      request.authenticatedUser.id,
      id,
      roomId,
      query.exclude ?? [],
      typeof requestId === 'string' ? requestId : undefined,
    );
  }

  @Post(':id/rooms/:roomId/suggestions/accept')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
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

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projects.findOne(request.authenticatedUser.id, id);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard)
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
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projects.remove(request.authenticatedUser.id, id);
  }

  @Post(':id/rooms')
  @UseGuards(SessionAuthGuard)
  createRoom(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRoomDto,
  ) {
    return this.projects.createRoom(request.authenticatedUser.id, id, dto);
  }

  @Patch(':id/floors')
  @UseGuards(SessionAuthGuard)
  applyProjectFloor(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProjectFloorDto,
  ) {
    return this.projects.applyProjectFloor(
      request.authenticatedUser.id,
      id,
      dto,
    );
  }

  @Patch(':id/rooms/:roomId')
  @UseGuards(SessionAuthGuard)
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
  removeRoom(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('roomId', new ParseUUIDPipe({ version: '4' })) roomId: string,
  ) {
    return this.projects.removeRoom(request.authenticatedUser.id, id, roomId);
  }
}
