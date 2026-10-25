import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PythonService } from '../../integrations/python/python.service.js';

@Controller('health')
export class ReadinessController {
  constructor(private readonly prisma: PrismaService, private readonly python: PythonService) {}

  @Get('ready')
  async ready() {
    const [postgres, python] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`, this.python.health(),
    ]);
    const services = { postgres: postgres.status === 'fulfilled' ? 'ok' : 'unavailable',
      python: python.status === 'fulfilled' ? 'ok' : 'unavailable' };
    const body = { status: Object.values(services).every(v => v === 'ok') ? 'ok' : 'unavailable',
      version: process.env.APP_VERSION ?? 'development', services, timestamp: new Date().toISOString() };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
