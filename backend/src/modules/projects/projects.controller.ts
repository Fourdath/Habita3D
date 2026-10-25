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
  Req,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/session-auth.guard.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { PreviewProjectDto } from './dto/preview-project.dto.js';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
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
