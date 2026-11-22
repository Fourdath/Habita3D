import { Controller, Get, Headers, ServiceUnavailableException } from '@nestjs/common';
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

  @Get('recommendations')
  async recommendations(@Headers('x-request-id') requestId?: string) {
    try {
      // This fixed probe exercises the protected Python path without reading or
      // writing catalogue or project data. It works on a fresh installation.
      const result = await this.python.recommendFloors({
        area_m2: '1',
        waste_percent: '0',
        available_budget_clp: 0,
        preferred_category: null,
        preferred_source: null,
        candidates: [],
      }, requestId);
      if (result.status !== 'no_candidates' || result.items.length !== 0) {
        throw new Error('Unexpected recommendation probe result');
      }
      return { status: 'ok', ruleVersion: result.rule_version };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
