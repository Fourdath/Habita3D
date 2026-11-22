import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    CapturesModule, AuthModule, UsersModule, ProjectsModule, ScenesModule,
    MaterialsModule, RecommendationsModule, HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
