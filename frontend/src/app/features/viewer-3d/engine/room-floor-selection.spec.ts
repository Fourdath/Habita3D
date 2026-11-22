import * as THREE from 'three';
import { catalogueFloorTexture } from './catalogue-floor-texture';
import { applyRoomFloorSelections, disposeRoomFloorMaterials } from './room-floor-selection';
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
  afterEach(() => { disposeRoomFloorMaterials(house); registry.dispose(); house.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); vi.restoreAllMocks(); });
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
  it('gives the eight catalogue models distinct local appearances and interprets advertised tile sizes', () => {
    const ceramicNames = [
      'Cerámica 46x46 cm Mixtura roble Café 1.9 m2',
      'Cerámica 45x45 cm Madera Jona Café 2.29 m2',
      'Cerámica piso muro Glaciar negro 42.5x42.5 cm 2.17 m2',
      'Cerámica piso muro California gris 36x36 cm 2.68 m2',
    ];
    const laminateNames = [
      'Piso flotante Classic touch Aquapro ferrara wildlife 7 mm 3.04 m2',
      'Piso flotante Farco Elegance roble 8 mm 2.40 m2',
      'Piso Flotante 8 mm Oak Brown Grey 1.99 m2',
      'Piso Laminado 8.3 mm Sena Café 2.4 m2',
    ];
    const ceramic = ceramicNames.map((name, index) => catalogueFloorTexture('ceramic', String(index), name));
    const laminate = laminateNames.map((name, index) => catalogueFloorTexture('laminate', String(index + 4), name));
    expect(ceramic.map(floor => floor.definition.procedural?.tile?.[0])).toEqual([0.46, 0.45, 0.425, 0.36]);
    expect(ceramic[0].options.layout).toBe('basketweave');
    expect(laminate.every(floor => floor.definition.procedural?.pattern === 'wood' && floor.options.layout === 'staggered')).toBe(true);
    expect(new Set([...ceramic, ...laminate].map(floor => floor.definition.procedural?.color)).size).toBe(8);
    expect(catalogueFloorTexture('ceramic', 'new', 'Porcelanato 60 x 30 cm Calacatta').definition.procedural)
      .toMatchObject({ tile: [0.6, 0.3], pattern: 'marble' });
    expect(catalogueFloorTexture('laminate', 'new', 'Modelo nuevo').definition.procedural)
      .toMatchObject({ kind: 'tile', pattern: 'wood' });
  });
  it('shares a generated product across rooms and releases it only when the last room changes', async () => {
    const living = house.children[0] as THREE.Mesh;
    const bedroom = house.children[1] as THREE.Mesh;
    const bedroomSelection = { ...selection, sceneRoomId: 'bedroom' };
    await applyRoomFloorSelections(house, [selection, bedroomSelection], 'none', registry);
    const material = living.material as THREE.MeshStandardMaterial;
    expect(bedroom.material).toBe(material);
    expect(material.map).toBeInstanceOf(THREE.Texture);
    expect(THREE.Loader.prototype.loadAsync).not.toHaveBeenCalled();
    const released = vi.spyOn(material.map!, 'dispose');
    await applyRoomFloorSelections(house, [bedroomSelection], 'none', registry);
    expect(bedroom.material).toBe(material);
    expect(released).not.toHaveBeenCalled();
    await applyRoomFloorSelections(house, [], 'none', registry);
    expect(released).toHaveBeenCalledOnce();
  });
});
