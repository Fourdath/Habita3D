import * as THREE from 'three';
import { applyRoomFloorSelections, disposeRoomFloorTints } from './room-floor-selection';
import { FLOOR_FINISHES, finishForPublication } from './floor-finishes';
import { MaterialRegistry } from './materials/material-registry';

describe('EP2 publication-to-room rendering', () => {
  let house: THREE.Group, registry: MaterialRegistry;
  const selection = { sceneRoomId: 'living', publicationKey: 'a'.repeat(64), category: 'laminate' as const };
  beforeEach(() => {
    vi.spyOn(THREE.Loader.prototype, 'loadAsync').mockResolvedValue(new THREE.Texture());
    registry = new MaterialRegistry(1, () => ({ map: new THREE.Texture(), normal: new THREE.Texture(), roughness: null }));
    house = new THREE.Group();
    for (const [roomId, type] of [['living', 'room-floor'], ['bedroom', 'room-floor'], ['living', 'room-ceiling']]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .1, 2), new THREE.MeshBasicMaterial());
      mesh.userData = { roomId, semanticType: type, roomSemantic: 'DRY' }; house.add(mesh);
    }
  });
  afterEach(() => { disposeRoomFloorTints(house); registry.dispose(); house.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); vi.restoreAllMocks(); });
  it('updates only the selected room floor, keeping the other room and ceiling independent', async () => {
    const ceilingMaterial = (house.children[2] as THREE.Mesh).material;
    await applyRoomFloorSelections(house, [selection], 'none', registry);
    expect(house.children[0].userData['selectedPublicationKey']).toBe(selection.publicationKey);
    expect(house.children[1].userData['selectedPublicationKey']).toBeUndefined();
    expect(((house.children[0] as THREE.Mesh).material as THREE.Material).userData['materialId']).toBe('NORDIC_FLOOR_WOOD_LIGHT');
    expect((house.children[2] as THREE.Mesh).material).toBe(ceilingMaterial);
  });
  it('preserves a saved floor through visual-style changes and removes it when cleared', async () => {
    await applyRoomFloorSelections(house, [selection], 'industrial', registry);
    expect(house.children[0].userData['selectedPublicationKey']).toBe(selection.publicationKey);
    await applyRoomFloorSelections(house, [], 'industrial', registry);
    expect(house.children[0].userData['selectedPublicationKey']).toBeUndefined();
    expect(((house.children[0] as THREE.Mesh).material as THREE.Material).userData['materialId']).toBe('INDUSTRIAL_FLOOR_WOOD_DARK');
  });
  it('rejects ambiguous scene links rather than painting the wrong saved room', async () => {
    await expect(applyRoomFloorSelections(house, [selection, { ...selection, publicationKey: 'b'.repeat(64) }], 'none', registry)).rejects.toThrow('Dos habitaciones');
  });
  it('does not apply a stale asynchronous selection', async () => {
    await applyRoomFloorSelections(house, [selection], 'none', registry, () => false);
    expect(house.children[0].userData['selectedPublicationKey']).toBeUndefined();
  });
  it('maps explicit publication descriptors to distinct finishes within each category', () => {
    expect(finishForPublication('ceramic', 'Cerámica Mixtura roble Café')).toBe('ceramic-wood');
    expect(finishForPublication('ceramic', 'Cerámica Calacatta')).toBe('marble');
    expect(finishForPublication('ceramic', 'Cerámica sin detalle')).toBe('ceramic-light');
    expect(finishForPublication('laminate', 'Piso flotante gris')).toBe('laminate-gray');
    expect(finishForPublication('laminate', 'Piso laminado nogal')).toBe('laminate-dark');
    expect(new Set(FLOOR_FINISHES.map(finish => finish.materialId)).size).toBe(FLOOR_FINISHES.length);
  });
  it('uses the chosen finish and tints a room without changing shared materials or maps', async () => {
    const base = await registry.get('FLOOR_TILE_MARBLE') as THREE.MeshStandardMaterial;
    const first = house.children[0] as THREE.Mesh;
    const second = house.children[1] as THREE.Mesh;
    const originalColor = base.color.clone();
    await applyRoomFloorSelections(house, [
      { sceneRoomId: 'living', finishId: 'marble', tint: '#b68362' },
      { sceneRoomId: 'bedroom', finishId: 'marble' },
    ], 'none', registry);
    const tinted = first.material as THREE.MeshStandardMaterial;
    expect(tinted).not.toBe(base);
    expect(tinted.map).toBe(base.map);
    expect(tinted.color.equals(new THREE.Color('#b68362'))).toBe(true);
    expect(second.material).toBe(base);
    expect(base.color.equals(originalColor)).toBe(true);
    const disposals = vi.spyOn(tinted, 'dispose');
    await applyRoomFloorSelections(house, [{ sceneRoomId: 'living', finishId: 'marble' }], 'none', registry);
    expect(first.material).toBe(base);
    expect(disposals).toHaveBeenCalledOnce();
  });
});
