import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { httpObservability } from './observability/http-observability.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '2mb' });
  app.use(httpObservability);
  const allowedOrigins = (process.env.API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (allowedOrigins.length) {
    app.enableCors({
      origin: allowedOrigins,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const openApi = new DocumentBuilder()
    .setTitle('Habita3D API')
    .setDescription('Sesiones, proyectos, presupuestos, catálogo y recomendaciones de pisos.')
    .setVersion('3.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer' })
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Materials-Token' }, 'materialsToken')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, openApi), {
    raw: ['json'],
    swaggerOptions: { persistAuthorization: false },
  });

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
