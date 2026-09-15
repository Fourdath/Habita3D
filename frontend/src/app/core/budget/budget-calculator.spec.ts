import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFloorplan } from '../floorplan/cubicasa-parser';
import { buildFloorplanGroup } from '../../features/viewer-3d/engine/floorplan-geometry';
import { MaterialRegistry } from '../../features/viewer-3d/engine/materials/material-registry';
import { computeConstructionBudget } from './budget-calculator';
import type { SurfaceManifest } from './surface-manifest.types';

const manifest: SurfaceManifest = {
  wallFaces: [
    { wallId: 'shared', side: 'A', environment: 'INTERIOR', assemblyId: 'INTERIOR_LIGHT', roomSemantic: 'DRY', rects: [{ widthM: 3, heightM: 2.6 }], areaM2: 7.8, wainscotAreaM2: 0 },
    { wallId: 'shared', side: 'B', environment: 'INTERIOR', assemblyId: 'INTERIOR_LIGHT', roomSemantic: 'BATHROOM', rects: [{ widthM: 3, heightM: 2.6 }], areaM2: 7.8, wainscotAreaM2: 6.3 },
  ],
  floors: [{ roomId: 'bath', name: 'Bath', semantic: 'BATHROOM', areaM2: 6 }],
  ceilings: [], baseboards: [], backsplash: [], concrete: [],
};

describe('construction budget from built surfaces', () => {
  it('uses ST and RH on opposite sides, with consistent demonstrative prices', () => {
    const budget = computeConstructionBudget(manifest, 'nordic');
    expect(budget.items.some((line) => line.productId === 'GYPSUM_BOARD_ST_12_5')).toBe(true);
    expect(budget.items.some((line) => line.productId === 'GYPSUM_BOARD_RH_12_5')).toBe(true);
    expect(budget.items.every((line) => line.isDemoPrice && line.priceSource === 'demo')).toBe(true);
    expect(budget.items.every((line) => line.subtotalClp === Math.round(line.purchaseQuantity * line.unitPriceClp))).toBe(true);
    expect(budget.totalClp).toBe(budget.items.reduce((sum, line) => sum + line.subtotalClp, 0));
  });

  it('quotes ceramic only for styles that actually display it', () => {
    const neutral = computeConstructionBudget(manifest, 'none');
    expect(neutral.items.some((line) => line.productId.startsWith('CERAMIC'))).toBe(false);
    const styled = computeConstructionBudget(manifest, 'nordic');
    const wall = styled.items.find((line) => line.productId === 'CERAMIC_NORDIC_WALL')!;
    expect(wall.unit).toBe('caja');
    expect(wall.waste?.required).toBe(6.3);
    expect(wall.purchaseQuantity).toBe(Math.ceil(wall.purchaseQuantity));
  });

  it('never includes decorative furniture products', () => {
    const budget = computeConstructionBudget(manifest, 'industrial');
    expect(budget.items.some((line) => /sofa|bed|chair/i.test(line.description))).toBe(false);
  });

  it('uses exterior fiber cement only on an exterior light face', () => {
    const exterior = structuredClone(manifest);
    exterior.wallFaces[0].environment = 'EXTERIOR';
    exterior.wallFaces[0].assemblyId = 'EXTERIOR_LIGHT';
    expect(computeConstructionBudget(exterior, 'nordic').items.some((line) => line.productId === 'EXTERIOR_FIBERCEMENT_BOARD')).toBe(true);
  });

  it('matches the bathroom surfaces built for the bundled plan', async () => {
    const svg = readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf8');
    const plan = parseFloorplan(svg);
    const registry = new MaterialRegistry();
    const built = await buildFloorplanGroup(plan, registry, 'none');
    const budget = computeConstructionBudget(built.manifest, 'nordic');
    const bathroomArea = built.manifest.wallFaces.reduce((sum, face) => sum + face.wainscotAreaM2, 0);
    expect(bathroomArea).toBeGreaterThan(0);
    expect(budget.items.find((line) => line.productId === 'CERAMIC_NORDIC_WALL')?.waste?.required).toBeCloseTo(bathroomArea, 2);
    expect(budget.items.filter((line) => line.waste).every((line) => line.waste!.waste >= 0)).toBe(true);
    expect(budget.totalClp).toBeGreaterThan(0);
    built.group.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    registry.dispose();
  });
});
