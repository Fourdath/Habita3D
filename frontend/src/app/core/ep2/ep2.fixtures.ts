// Synthetic data for isolated tests only. Never imported by application components.
import type { CatalogStatus, Project, ProjectBudget, Publication } from './ep2.types';
export const TEST_PUBLICATION: Publication = {
  publicationKey: 'a'.repeat(64), source: 'easy', category: 'ceramic', name: 'Piso sintético de prueba', seller: 'Easy', brand: null, sku: 'test-only',
  productUrl: 'https://example.test/producto', imageUrl: null, currency: 'CLP', priceType: 'public', pricePerBoxClp: 10000,
  coveragePerBoxM2: '2', pricePerM2Clp: '5000', saleUnit: 'box', availability: 'unknown', commune: 'La Florida',
  checkedAt: '2026-01-01T03:04:00.000Z', lastCheckedDisplay: '01/01/2026 00:04',
};
export const TEST_PROJECT: Project = {
  id: 7, name: 'Proyecto sintético', budgetClp: 100000, createdAt: '', updatedAt: '',
  rooms: [{ id: 'room-test', projectId: 7, name: 'Habitación de prueba', areaMode: 'area', areaM2: '10.25', lengthM: null, widthM: null,
    wastePercent: '10', budgetClp: null, sceneRoomId: 'scene-test', publicationKey: null, publication: null }],
};
export const TEST_BUDGET: ProjectBudget = {
  project_id: 7, total_rooms: 1, unselected_room_ids: ['room-test'], status: 'uncalculable', rooms: [],
  calculable_subtotal_clp: 0, total_cost_clp: null, budget_clp: 100000, budget_excess_clp: null, fits_budget: null,
  calculation_basis: 'latest_persisted_publications', scope: 'floor_boxes_only',
};
export const TEST_STATUS: CatalogStatus = { publicationCount: 1, latestRun: { status: 'complete', finishedAt: TEST_PUBLICATION.checkedAt }, latestJob: null, groups: [], schedule: { enabled: false, hours: [8, 12, 16], timezone: 'America/Santiago' } };
