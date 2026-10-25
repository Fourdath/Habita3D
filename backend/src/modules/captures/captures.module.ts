import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { PythonModule } from '../../integrations/python/python.module.js';
import { MaterialsModule } from '../materials/materials.module.js';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { CapturesScheduler } from './captures.scheduler.js';
import { MaterialsTokenGuard } from './materials-token.guard.js';

@Module({ imports: [PrismaModule, PythonModule, MaterialsModule], controllers: [CapturesController],
  providers: [CapturesService, CapturesScheduler, MaterialsTokenGuard] })
export class CapturesModule {}
