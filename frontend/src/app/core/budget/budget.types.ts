import type { InteriorStyleId } from '../interior-style/interior-style.types';
import type { ConstructionProductId, ConstructionProductUnit } from './construction-product.types';
import type { LinearCutOptimization } from './linear-cut-optimizer';
import type { SheetCutOptimization } from './sheet-cut-optimizer';

export interface BudgetWaste {
  unit: 'm' | 'm2';
  required: number;
  purchased: number;
  waste: number;
  utilizationPercent: number;
}

export interface ConstructionBudgetLine {
  id: string;
  productId: ConstructionProductId;
  description: string;
  unit: ConstructionProductUnit;
  requiredQuantity: number;
  purchaseQuantity: number;
  /** UI-compatible alias for purchaseQuantity. */
  quantity: number;
  unitPriceClp: number;
  subtotalClp: number;
  isDemoPrice: true;
  priceSource: 'demo';
  waste?: BudgetWaste;
  optimizationSummary?: LinearCutOptimization | SheetCutOptimization;
}

export interface ConstructionBudgetSummary {
  styleId: InteriorStyleId;
  isDemoPricing: true;
  items: ConstructionBudgetLine[];
  totalClp: number;
  requiresStructuralSpecification: boolean;
}
