import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module.js';

import { MaterialsController } from './materials.controller.js';
import { MaterialsImportGuard } from './materials-token.guard.js';
import { MaterialsService } from './materials.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, MaterialsImportGuard],
  exports: [MaterialsService],
})
export class MaterialsModule {}
