import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { ReadinessController } from './readiness.controller.js';

describe('readiness', () => {
  it.each([[true, true], [false, true], [true, false]])('reports database=%s python=%s', async (db, py) => {
    const controller = new ReadinessController(
      { $queryRaw: () => db ? Promise.resolve([1]) : Promise.reject(new Error('secret connection info')) } as unknown as PrismaService,
      { health: () => py ? Promise.resolve() : Promise.reject(new Error('secret token')) } as unknown as PythonService,
    );
    if (db && py) expect((await controller.ready()).status).toBe('ok');
    else {
      try { await controller.ready(); throw new Error('must fail'); }
      catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        const response = (error as ServiceUnavailableException).getResponse();
        expect(JSON.stringify(response)).not.toContain('secret');
        expect(response).toMatchObject({ status: 'unavailable', services: { postgres: db ? 'ok' : 'unavailable', python: py ? 'ok' : 'unavailable' } });
      }
    }
  });
});
