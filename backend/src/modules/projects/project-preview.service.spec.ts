import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';

import { ProjectPreviewService } from './project-preview.service.js';
import { ProjectsService } from './projects.service.js';

const dto = { name: 'Casa piloto', areaM2: 60, budgetClp: 2_000_000 };
const recommendation = {
  recommended_tier: 'standard',
  estimated_cost_clp: 1_800_000,
  budget_difference_clp: 200_000,
  fits_budget: true,
  reason: 'Costo demostrativo dentro del presupuesto',
  source: 'demo',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ProjectPreviewService', () => {
  const setup = () => {
    const create = vi.fn().mockResolvedValue({ id: 7, name: dto.name });
    const service = new ProjectPreviewService({ create } as unknown as ProjectsService);
    return { service, create };
  };

  it('gets a validated comparison before persisting a project', async () => {
    vi.stubEnv('PYTHON_SERVICE_URL', 'http://python-service:8000');
    const upstream = vi.fn().mockResolvedValue(Response.json(recommendation));
    vi.stubGlobal('fetch', upstream);
    const { service, create } = setup();

    const result = await service.create(dto);

    expect(result).toEqual({ project: { id: 7, name: dto.name }, recommendation });
    expect(create).toHaveBeenCalledWith(dto.name);
    expect(upstream).toHaveBeenCalledWith(
      new URL('http://python-service:8000/recommendations/compare'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ area_m2: 60, budget_clp: 2_000_000 }),
      }),
    );
  });

  it('does not save a project when Python is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const { service, create } = setup();

    await expect(service.create(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not save a project on an upstream error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));
    const { service, create } = setup();

    await expect(service.create(dto)).rejects.toBeInstanceOf(BadGatewayException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an invalid upstream contract before persisting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ source: 'demo' })));
    const { service, create } = setup();

    await expect(service.create(dto)).rejects.toBeInstanceOf(BadGatewayException);
    expect(create).not.toHaveBeenCalled();
  });
});
