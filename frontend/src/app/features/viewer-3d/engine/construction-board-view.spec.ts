import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { computeConstructionBudget } from '../../../core/budget/budget-calculator';
import type { ManifestWallFace } from '../../../core/budget/surface-manifest.types';
import { parseFloorplan } from '../../../core/floorplan/cubicasa-parser';
import { CONSTRUCTION_VIEW_LEGEND, ConstructionBoardView } from './construction-board-view';
import { buildFloorplanGroup } from './floorplan-geometry';
import { MaterialRegistry } from './materials/material-registry';
import { disposeObject3D } from './three-object-disposal';

describe('ConstructionBoardView', () => {
  let house: THREE.Group;
  let view: ConstructionBoardView;
  let geometry: THREE.BufferGeometry;
  let finish: THREE.Material;
  let concreteMap: THREE.Texture;
  let concreteMaterial: THREE.MeshStandardMaterial;
  let getMaterial: ReturnType<typeof vi.fn<MaterialRegistry['get']>>;

  beforeEach(() => {
    house = new THREE.Group();
    geometry = new THREE.PlaneGeometry(2, 2);
    finish = new THREE.MeshStandardMaterial({ color: 0xffffff });
    concreteMap = new THREE.Texture();
    concreteMaterial = new THREE.MeshStandardMaterial({ map: concreteMap });
    getMaterial = vi.fn<MaterialRegistry['get']>().mockResolvedValue(concreteMaterial);
    view = new ConstructionBoardView({ get: getMaterial });
  });

  afterEach(() => {
    view.dispose();
    geometry.dispose();
    finish.dispose();
    concreteMaterial.dispose();
    concreteMap.dispose();
  });

  function addFace(data: Partial<ManifestWallFace> & { semanticType?: string }, target = house): THREE.Mesh {
    const face = new THREE.Mesh(geometry, finish);
    face.userData = { semanticType: 'wall-finish', assemblyId: 'INTERIOR_LIGHT', environment: 'INTERIOR', roomSemantic: 'DRY', ...data };
    target.add(face);
    return face;
  }

  it('matches dry, wet and exterior faces to their documented sheet type', async () => {
    const dry = addFace({});
    const wet = addFace({ roomSemantic: 'BATHROOM' });
    const exterior = addFace({ assemblyId: 'EXTERIOR_LIGHT', environment: 'EXTERIOR', semanticType: 'exterior-finish' });
    const concrete = addFace({ assemblyId: 'EXTERIOR_CONCRETE', environment: 'EXTERIOR', semanticType: 'exterior-finish' });
    const unrelated = addFace({ semanticType: 'fixture' });
    await view.setEnabled(true, house);
    expect(dry.children[0].name).toBe('construction-board-GYPSUM_BOARD_ST_12_5');
    expect(wet.children[0].name).toBe('construction-board-GYPSUM_BOARD_RH_12_5');
    expect(exterior.children[0].name).toBe('construction-board-EXTERIOR_FIBERCEMENT_BOARD');
    expect(exterior.children[1].name).toBe('construction-concrete-wall');
    const exteriorGrid = (exterior.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(exteriorGrid.transparent).toBe(true);
    expect(exteriorGrid.depthWrite).toBe(false);
    expect(concrete.children[0].name).toBe('construction-concrete-wall');
    expect(unrelated.children).toHaveLength(0);
  });

  it('reuses a metric grid and releases the overlay without replacing the finish or geometry', async () => {
    const first = addFace({});
    const second = addFace({});
    await view.setEnabled(true, house);
    await view.setEnabled(true, house);
    expect(first.children).toHaveLength(1);
    const overlay = first.children[0] as THREE.Mesh;
    const material = overlay.material as THREE.MeshBasicMaterial;
    expect((second.children[0] as THREE.Mesh).material).toBe(material);
    expect(overlay.geometry).toBe(first.geometry);
    expect(material.map?.repeat.x).toBeCloseTo(1 / 1.2);
    expect(material.map?.repeat.y).toBeCloseTo(1 / 2.4);
    const dispose = vi.spyOn(material, 'dispose');
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    await view.setEnabled(false, house);
    expect(first.children).toHaveLength(0);
    expect(second.children).toHaveLength(0);
    expect(first.material).toBe(finish);
    view.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(disposeGeometry).not.toHaveBeenCalled();
  });

  it('removes old board overlays before annotating new geometry', async () => {
    const oldFace = addFace({});
    const replacement = new THREE.Group();
    const newFace = addFace({ roomSemantic: 'BATHROOM' }, replacement);
    await view.setEnabled(true, house);
    await view.setEnabled(true, replacement);
    expect(oldFace.children).toHaveLength(0);
    expect(newFace.children[0].name).toBe('construction-board-GYPSUM_BOARD_RH_12_5');
  });

  it('uses local concrete maps for the structural walls and floors and preserves changes to their regular materials', async () => {
    const wall = addFace({ semanticType: 'wall-structure' });
    const slab = addFace({ semanticType: 'floor-structure' });
    const floor = addFace({ semanticType: 'room-floor' });
    floor.receiveShadow = true;
    await view.setEnabled(true, house);
    expect(getMaterial).toHaveBeenCalledWith('INDUSTRIAL_WALL_CONCRETE_VISIBLE');
    expect(getMaterial).toHaveBeenCalledWith('FLOOR_CONCRETE_SMOOTH');
    const overlay = floor.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(wall.children[0].name).toBe('construction-concrete-wall');
    expect(slab.children[0].name).toBe('construction-concrete-floor');
    expect(overlay.geometry).toBe(floor.geometry);
    expect(overlay.material.map).toBe(concreteMap);
    expect(overlay.material).not.toBe(concreteMaterial);
    expect(overlay.receiveShadow).toBe(true);
    const disposeMap = vi.spyOn(concreteMap, 'dispose');
    const updated = new THREE.MeshStandardMaterial();
    floor.material = updated;
    try {
      await view.setEnabled(false, house);
      expect(floor.children).toHaveLength(0);
      expect(floor.material).toBe(updated);
      expect(wall.material).toBe(finish);
      view.dispose();
      expect(disposeMap).not.toHaveBeenCalled();
    } finally {
      updated.dispose();
    }
  });

  it('does not add concrete to an old view after the texture resolves', async () => {
    let load!: (material: THREE.Material) => void;
    getMaterial.mockReturnValueOnce(new Promise(resolve => { load = resolve; }));
    const floor = addFace({ semanticType: 'room-floor' });
    const pending = view.setEnabled(true, house);
    await view.setEnabled(false, house);
    load(concreteMaterial);
    await pending;
    expect(floor.children).toHaveLength(0);
    expect(floor.material).toBe(finish);
  });

  it('visualizes the same board coverage that the budget measures on the example plan', async () => {
    const plan = parseFloorplan(readFileSync(resolve(process.cwd(), 'public/assets/floorplans/model.svg'), 'utf8'));
    const registry = new MaterialRegistry();
    const model = await buildFloorplanGroup(plan, registry, 'none');
    try {
      await view.setEnabled(true, model.group);
      const budget = computeConstructionBudget(model.manifest, 'none');
      for (const { productId } of CONSTRUCTION_VIEW_LEGEND) {
        let overlayArea = 0;
        model.group.traverse(object => {
          if (!(object instanceof THREE.Mesh) || object.name !== `construction-board-${productId}`) return;
          const uv = object.geometry.getAttribute('uv');
          overlayArea += Math.abs((uv.getX(2) - uv.getX(0)) * (uv.getY(2) - uv.getY(0)));
        });
        const quantity = budget.items.find(line => line.productId === productId)?.waste?.required ?? 0;
        expect(overlayArea).toBeGreaterThan(0);
        expect(overlayArea).toBeCloseTo(quantity, 2);
      }
    } finally {
      await view.setEnabled(false, model.group);
      disposeObject3D(model.group, { keepMaterials: true });
      registry.dispose();
    }
  });
});
