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

describe('recommendation health probe', () => {
  it('checks the protected Python recommendation contract on an empty catalogue', async () => {
    const recommendFloors = vi.fn().mockResolvedValue({
      status: 'no_candidates', items: [], rule_version: 'floor-rules-v1',
    });
    const controller = new ReadinessController(
      {} as PrismaService, { recommendFloors } as unknown as PythonService,
    );

    await expect(controller.recommendations('test-req')).resolves.toEqual({
      status: 'ok', ruleVersion: 'floor-rules-v1',
    });
    expect(recommendFloors).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [], available_budget_clp: 0 }), 'test-req',
    );
  });

  it('reports unavailability without disclosing connection details', async () => {
    const recommendFloors = vi.fn().mockRejectedValue(new Error('private connection details'));
    const controller = new ReadinessController(
      {} as PrismaService, { recommendFloors } as unknown as PythonService,
    );

    await expect(controller.recommendations()).rejects.toMatchObject({
      status: 503, response: { status: 'unavailable' },
    });
  });
});
