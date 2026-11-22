import { BadGatewayException, Injectable } from '@nestjs/common';

import { PythonService } from '../../integrations/python/python.service.js';
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
    typeof result.recommended_tier === 'string' &&
    ['basic', 'standard', 'premium'].includes(result.recommended_tier) &&
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
  constructor(private readonly projects: ProjectsService, private readonly python: PythonService) {}

  async create(dto: PreviewProjectDto, requestId?: string) {
    const result = await this.python.compareDemonstration({
      area_m2: dto.areaM2,
      budget_clp: dto.budgetClp,
    }, requestId);

    if (!isDemoRecommendation(result)) {
      throw new BadGatewayException(
        'La respuesta de recomendaciones no cumple el contrato',
      );
    }

    // Persist only after the specialist service has produced a valid response.
    const project = await this.projects.create(dto.name.trim());
    return { project, recommendation: result };
  }
}
