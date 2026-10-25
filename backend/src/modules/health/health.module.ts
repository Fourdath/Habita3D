import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { PythonModule } from '../../integrations/python/python.module.js';
import { ReadinessController } from './readiness.controller.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [PrismaModule, PythonModule],
  controllers: [HealthController, ReadinessController],
  providers: [HealthService],
})
export class HealthModule {}
