import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PreviewProjectDto } from './dto/preview-project.dto.js';
import { ProjectsService } from './projects.service.js';

export interface DemoRecommendation {
  recommended_tier: 'basic' | 'standard' | 'premium';
  estimated_cost_clp: number;
  budget_difference_clp: number;
  fits_budget: boolean;
  reason: string;
  source: 'demo';
}

function isDemoRecommendation(value: unknown): value is DemoRecommendation {
  if (typeof value !== 'object' || value === null) return false;

  const result = value as Record<string, unknown>;
  return (
    ['basic', 'standard', 'premium'].includes(String(result.recommended_tier)) &&
    Number.isSafeInteger(result.estimated_cost_clp) &&
    Number.isSafeInteger(result.budget_difference_clp) &&
    typeof result.fits_budget === 'boolean' &&
    typeof result.reason === 'string' &&
    result.reason.length > 0 &&
    result.source === 'demo'
  );
}

@Injectable()
export class ProjectPreviewService {
  constructor(private readonly projects: ProjectsService) {}

  async create(dto: PreviewProjectDto) {
    const baseUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000';
    let response: Response;

    try {
      response = await fetch(new URL('/recommendations/compare', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ area_m2: dto.areaM2, budget_clp: dto.budgetClp }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException('El servicio de recomendaciones no está disponible');
    }

    if (!response.ok) {
      throw new BadGatewayException('El servicio de recomendaciones rechazó la solicitud');
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new BadGatewayException('La respuesta de recomendaciones no es JSON válido');
    }

    if (!isDemoRecommendation(result)) {
      throw new BadGatewayException('La respuesta de recomendaciones no cumple el contrato');
    }

    // Persist only after the specialist service has produced a valid response.
    const project = await this.projects.create(dto.name.trim());
    return { project, recommendation: result };
  }
}
