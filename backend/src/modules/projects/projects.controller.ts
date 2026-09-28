import { Body, Controller, Get, Post } from '@nestjs/common';

import { CreateProjectDto } from './dto/create-project.dto.js';
import { PreviewProjectDto } from './dto/preview-project.dto.js';
import { ProjectPreviewService } from './project-preview.service.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly previews: ProjectPreviewService,
  ) {}

  @Post('preview')
  preview(@Body() dto: PreviewProjectDto) {
    return this.previews.create(dto);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto.name);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }
}
