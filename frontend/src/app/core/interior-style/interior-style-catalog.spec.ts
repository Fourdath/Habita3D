import { findFurnitureCatalogEntry, FURNITURE_CATALOG } from './furniture-catalog';
import { getInteriorStyle, listInteriorStyles } from './interior-style-catalog';

describe('interior style catalog', () => {
  it('lists exactly the three defined styles: none, nordic, industrial', () => {
    const styles = listInteriorStyles();
    expect(styles.map((s) => s.id)).toEqual(['none', 'nordic', 'industrial']);
  });

  it('gives "none" no architectural material override and no budget items', () => {
    const none = getInteriorStyle('none');
    expect(none.interiorWallMaterial).toBeNull();
    expect(none.exteriorWallMaterial).toBeNull();
    expect(none.floorMaterial).toBeNull();
    expect(none.ceilingMaterial).toBeNull();
    expect(none.budgetItems).toHaveLength(0);
  });

  it('gives nordic and industrial a distinct wall + floor material and non-empty budget', () => {
    const nordic = getInteriorStyle('nordic');
    const industrial = getInteriorStyle('industrial');

    expect(nordic.interiorWallMaterial).not.toBeNull();
    expect(nordic.exteriorWallMaterial).not.toBeNull();
    expect(nordic.floorMaterial).not.toBeNull();
    expect(industrial.interiorWallMaterial).not.toBeNull();
    expect(industrial.exteriorWallMaterial).not.toBeNull();
    expect(industrial.floorMaterial).not.toBeNull();
    expect(nordic.interiorWallMaterial!.texturePath).not.toBe(industrial.interiorWallMaterial!.texturePath);
    expect(nordic.exteriorWallMaterial!.texturePath).not.toBe(industrial.exteriorWallMaterial!.texturePath);
    expect(nordic.floorMaterial!.texturePath).not.toBe(industrial.floorMaterial!.texturePath);
    expect(nordic.budgetItems.length).toBeGreaterThan(0);
    expect(industrial.budgetItems.length).toBeGreaterThan(0);
  });
});

describe('furniture catalog', () => {
  const CATEGORIES = ['sofa', 'table', 'chair', 'bed', 'nightstand'] as const;

  it('has exactly ten entries: one per category, per style (nordic + industrial)', () => {
    expect(FURNITURE_CATALOG).toHaveLength(10);
  });

  it('has both a nordic and an industrial variant for every category', () => {
    for (const category of CATEGORIES) {
      expect(findFurnitureCatalogEntry(category, 'nordic')).toBeDefined();
      expect(findFurnitureCatalogEntry(category, 'industrial')).toBeDefined();
    }
  });

  it('gives every entry a positive price and a model path under the matching style folder', () => {
    for (const entry of FURNITURE_CATALOG) {
      expect(entry.priceClp).toBeGreaterThan(0);
      expect(entry.modelPath).toContain(`furniture/${entry.style}/`);
      expect(entry.modelPath.endsWith('.glb')).toBe(true);
    }
  });
});
