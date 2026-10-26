export type FloorCategory = 'ceramic' | 'laminate';
export type RetailSource = 'sodimac' | 'easy';
export type Availability = 'available' | 'unavailable' | 'unknown';
export interface Page<T> { items: T[]; total: number; page: number; limit: number }
export interface CaptureAttempt {
  source: RetailSource; category: FloorCategory; status: string;
  finishedAt: string | null; errors: unknown[];
}
export interface Publication {
  publicationKey: string; source: RetailSource; category: FloorCategory;
  name: string; seller: string; brand: string | null; sku: string | null;
  productUrl: string; imageUrl: string | null; currency: 'CLP'; priceType: string;
  pricePerBoxClp: number; coveragePerBoxM2: string | null; pricePerM2Clp: string | null;
  saleUnit: string; availability: Availability; commune: string;
  checkedAt: string; lastCheckedDisplay: string; lastAttempt?: CaptureAttempt;
}
export interface PriceObservation {
  id: number; observedAt: string; observedDisplay: string; changeType: string;
  pricePerBoxClp: number; coveragePerBoxM2: string | null; pricePerM2Clp: string | null; saleUnit: string;
}
export interface PriceHistory extends Page<PriceObservation> {
  publicationKey: string; currency: string; priceType: string; seller: string; communeCode: string;
}
export interface CatalogStatus {
  publicationCount: number;
  latestRun: { status: string; finishedAt: string } | null;
  latestJob: { status: string; errorCode: string | null; startedAt: string; finishedAt: string | null } | null;
  groups: CaptureAttempt[];
  schedule: { enabled: boolean; hours: number[]; timezone: string };
}
export interface ProjectSummary { id: number; name: string; budgetClp: number; createdAt: string; updatedAt: string }
export interface Project extends ProjectSummary { rooms: ProjectRoom[] }
export interface RoomInput {
  name: string; areaMode: 'area' | 'dimensions'; areaM2?: string; lengthM?: string; widthM?: string;
  wastePercent: string; budgetClp: number | null; sceneRoomId: string | null;
}
export interface ProjectRoom extends Omit<RoomInput, 'areaM2' | 'lengthM' | 'widthM'> {
  id: string; projectId: number; areaM2: string | null; lengthM: string | null; widthM: string | null;
  publicationKey: string | null; publication: Publication | null;
}
export interface RoomBudget {
  room_id: string; publication_key: string; status: 'calculated' | 'uncalculable';
  reasons: ('missing_price' | 'missing_coverage')[];
  area_m2: string; waste_percent: string; required_area_m2: string | null;
  coverage_per_box_m2: string | null; price_per_box_clp: number | null;
  boxes: number | null; purchased_area_m2: string | null; cost_clp: number | null;
  budget_clp: number | null; budget_excess_clp: number | null; fits_budget: boolean | null;
  checked_at: string; last_check_display: string;
}
export interface ProjectBudget {
  project_id: number; total_rooms: number; unselected_room_ids: string[];
  status: 'complete' | 'partial' | 'uncalculable'; rooms: RoomBudget[];
  calculable_subtotal_clp: number; total_cost_clp: number | null;
  budget_clp: number; budget_excess_clp: number | null; fits_budget: boolean | null;
  calculation_basis: 'latest_persisted_publications'; scope: 'floor_boxes_only';
}
export interface SceneRoom { id: string; name: string; areaM2: number }
