import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { ScenesModule } from './modules/scenes/scenes.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { RecommendationsModule } from './modules/recommendations/recommendations.module.js';
import { CapturesModule } from './modules/captures/captures.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { RequestRateLimitGuard } from './observability/request-rate-limit.guard.js';

@Module({
  imports: [
    CapturesModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    ScenesModule,
    MaterialsModule,
    RecommendationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: RequestRateLimitGuard },
  ],
})
export class AppModule {}
