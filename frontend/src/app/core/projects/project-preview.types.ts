export interface ProjectPreviewRequest {
  name: string;
  areaM2: number;
  budgetClp: number;
}

export interface ProjectPreviewResponse {
  project: {
    id: number;
    name: string;
  };
  recommendation: {
    recommended_tier: string;
    estimated_cost_clp: number;
    budget_difference_clp: number;
    fits_budget: boolean;
    reason: string;
    source: 'demo';
  };
}
