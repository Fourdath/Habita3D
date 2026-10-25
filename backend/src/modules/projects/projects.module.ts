import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module.js';
import { PythonModule } from '../../integrations/python/python.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectPreviewService } from './project-preview.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [PrismaModule, AuthModule, PythonModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectPreviewService],
})
export class ProjectsModule {}
