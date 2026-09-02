import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { ScenesModule } from './modules/scenes/scenes.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { RecommendationsModule } from './modules/recommendations/recommendations.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [AuthModule, UsersModule, ProjectsModule, ScenesModule, MaterialsModule, RecommendationsModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
