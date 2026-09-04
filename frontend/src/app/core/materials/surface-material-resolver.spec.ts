import { resolveRoomFloorMaterial, resolveWallSurfaceMaterial } from './surface-material-resolver';

describe('surface material resolver', () => {
  it('keeps living and bedroom surfaces non-ceramic', () => {
    expect(resolveRoomFloorMaterial('nordic', 'DRY')).toBe('NORDIC_FLOOR_WOOD_LIGHT');
    expect(resolveWallSurfaceMaterial({ styleId: 'nordic', wallId: 'w', side: 'A', environment: 'INTERIOR', roomSemantic: 'DRY' })).toBe('NORDIC_WALL_PASTEL_BLUE');
  });

  it('never gives a bathroom a wood floor', () => {
    expect(resolveRoomFloorMaterial('nordic', 'BATHROOM')).toBe('NORDIC_BATH_FLOOR_TILE_LIGHT');
    expect(resolveRoomFloorMaterial('industrial', 'BATHROOM')).toBe('INDUSTRIAL_BATH_FLOOR_TILE_GRAY');
  });

  it('uses cream by default and exposed finishes only by explicit override', () => {
    const context = { styleId: 'industrial' as const, wallId: 'w', side: 'A' as const, environment: 'INTERIOR' as const, roomSemantic: 'DRY' as const };
    expect(resolveWallSurfaceMaterial(context)).toBe('INDUSTRIAL_WALL_CREAM');
    expect(resolveWallSurfaceMaterial({ ...context, overrides: [{ wallId: 'w', side: 'A', materialId: 'INDUSTRIAL_WALL_BRICK_EXPOSED' }] })).toBe('INDUSTRIAL_WALL_BRICK_EXPOSED');
  });

  it('allows different materials on each wall side', () => {
    const overrides = [{ wallId: 'w', side: 'A' as const, materialId: 'INDUSTRIAL_WALL_CONCRETE_VISIBLE' as const }];
    expect(resolveWallSurfaceMaterial({ styleId: 'industrial', wallId: 'w', side: 'A', environment: 'INTERIOR', roomSemantic: 'DRY', overrides })).toBe('INDUSTRIAL_WALL_CONCRETE_VISIBLE');
    expect(resolveWallSurfaceMaterial({ styleId: 'industrial', wallId: 'w', side: 'B', environment: 'INTERIOR', roomSemantic: 'DRY', overrides })).toBe('INDUSTRIAL_WALL_CREAM');
  });
});
