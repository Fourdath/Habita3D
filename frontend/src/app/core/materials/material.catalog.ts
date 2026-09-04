import type { MaterialDefinition, MaterialId } from './material.types';

const pbr = (basePath: string) => ({
  albedo: `${basePath}/diffuse.jpg`,
  normalGl: `${basePath}/normal.png`,
  roughness: `${basePath}/roughness.jpg`,
});

export const MATERIAL_CATALOG: Record<MaterialId, MaterialDefinition> = {
  MATERIAL_NOT_CONFIGURED: { id: 'MATERIAL_NOT_CONFIGURED', provider: 'procedural', baseColor: 0xff00ff, roughness: 1, metalness: 0, status: 'NOT_CONFIGURED' },
  DEFAULT_WALL_NEUTRAL: { id: 'DEFAULT_WALL_NEUTRAL', provider: 'procedural', baseColor: 0xeee9df, roughness: 0.92, metalness: 0, status: 'READY' },
  DEFAULT_FLOOR_NEUTRAL: { id: 'DEFAULT_FLOOR_NEUTRAL', provider: 'procedural', baseColor: 0xb9ab97, roughness: 0.9, metalness: 0, status: 'READY' },
  DEFAULT_EXTERIOR_NEUTRAL: { id: 'DEFAULT_EXTERIOR_NEUTRAL', provider: 'procedural', baseColor: 0xd8d1c5, roughness: 0.96, metalness: 0, status: 'READY' },
  NORDIC_WALL_PASTEL_BLUE: { id: 'NORDIC_WALL_PASTEL_BLUE', provider: 'procedural', baseColor: 0xd9eaf4, roughness: 0.92, metalness: 0, status: 'READY' },
  NORDIC_FLOOR_WOOD_LIGHT: { id: 'NORDIC_FLOOR_WOOD_LIGHT', provider: 'polyhaven', assetSlug: 'oak_wood_planks', assetName: 'Oak Wood Planks', license: 'CC0', physicalWidthMeters: 1.2, physicalHeightMeters: 1.2, maps: pbr('assets/textures/oak_wood_planks'), baseColor: 0xffffff, roughness: 0.42, metalness: 0, normalScale: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.5, status: 'READY' },
  NORDIC_BATH_WALL_TILE_LIGHT: { id: 'NORDIC_BATH_WALL_TILE_LIGHT', provider: 'procedural', baseColor: 0xf3f4f2, roughness: 0.72, metalness: 0, status: 'PENDING_ASSET' },
  NORDIC_BATH_FLOOR_TILE_LIGHT: { id: 'NORDIC_BATH_FLOOR_TILE_LIGHT', provider: 'procedural', baseColor: 0xc8ced1, roughness: 0.8, metalness: 0, status: 'PENDING_ASSET' },
  NORDIC_KITCHEN_BACKSPLASH_LIGHT: { id: 'NORDIC_KITCHEN_BACKSPLASH_LIGHT', provider: 'procedural', baseColor: 0xf4f4ef, roughness: 0.72, metalness: 0, status: 'PENDING_ASSET' },
  NORDIC_KITCHEN_CABINET_WHITE_WOOD: { id: 'NORDIC_KITCHEN_CABINET_WHITE_WOOD', provider: 'procedural', baseColor: 0xf2f0e9, roughness: 0.65, metalness: 0, status: 'PENDING_ASSET' },
  NORDIC_COUNTERTOP_LIGHT: { id: 'NORDIC_COUNTERTOP_LIGHT', provider: 'procedural', baseColor: 0xdad8d2, roughness: 0.55, metalness: 0, status: 'PENDING_ASSET' },
  NORDIC_EXTERIOR_LIGHT: { id: 'NORDIC_EXTERIOR_LIGHT', provider: 'polyhaven', assetSlug: 'white_stucco', assetName: 'White Stucco', license: 'CC0', physicalWidthMeters: 2, physicalHeightMeters: 2, maps: pbr('assets/textures/white_stucco'), baseColor: 0xffffff, roughness: 0.96, metalness: 0, normalScale: 0.35, status: 'READY' },
  INDUSTRIAL_WALL_CREAM: { id: 'INDUSTRIAL_WALL_CREAM', provider: 'procedural', baseColor: 0xc8b39e, roughness: 0.92, metalness: 0, status: 'READY' },
  INDUSTRIAL_FLOOR_WOOD_DARK: { id: 'INDUSTRIAL_FLOOR_WOOD_DARK', provider: 'polyhaven', assetSlug: 'laminate_floor_02', assetName: 'Laminate Floor 02', license: 'CC0', physicalWidthMeters: 1.7, physicalHeightMeters: 1.7, maps: pbr('assets/textures/laminate_floor_02'), baseColor: 0xffffff, roughness: 0.48, metalness: 0, normalScale: 0.4, clearcoat: 0.08, clearcoatRoughness: 0.58, status: 'READY' },
  INDUSTRIAL_WALL_BRICK_EXPOSED: { id: 'INDUSTRIAL_WALL_BRICK_EXPOSED', provider: 'polyhaven', assetSlug: 'brick_wall_003', assetName: 'Brick Wall 003', license: 'CC0', physicalWidthMeters: 4, physicalHeightMeters: 4, maps: pbr('assets/textures/brick_wall_003'), baseColor: 0xffffff, roughness: 0.92, metalness: 0, normalScale: 0.55, status: 'READY' },
  INDUSTRIAL_WALL_CONCRETE_VISIBLE: { id: 'INDUSTRIAL_WALL_CONCRETE_VISIBLE', provider: 'polyhaven', assetSlug: 'rough_concrete', assetName: 'Rough Concrete', license: 'CC0', physicalWidthMeters: 1.23, physicalHeightMeters: 1.23, maps: pbr('assets/textures/rough_concrete'), baseColor: 0xffffff, roughness: 0.9, metalness: 0, normalScale: 0.35, status: 'READY' },
  INDUSTRIAL_BATH_WALL_TILE_GRAY: { id: 'INDUSTRIAL_BATH_WALL_TILE_GRAY', provider: 'procedural', baseColor: 0xadb2b5, roughness: 0.78, metalness: 0, status: 'PENDING_ASSET' },
  INDUSTRIAL_BATH_FLOOR_TILE_GRAY: { id: 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY', provider: 'procedural', baseColor: 0x62686c, roughness: 0.86, metalness: 0, status: 'PENDING_ASSET' },
  INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY: { id: 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY', provider: 'procedural', baseColor: 0x85898b, roughness: 0.78, metalness: 0, status: 'PENDING_ASSET' },
  CEILING_WHITE: { id: 'CEILING_WHITE', provider: 'procedural', baseColor: 0xf7f7f5, roughness: 0.98, metalness: 0, status: 'READY' },
  BASEBOARD_WHITE: { id: 'BASEBOARD_WHITE', provider: 'procedural', baseColor: 0xf7f5ef, roughness: 0.62, metalness: 0, status: 'READY' },
  BASEBOARD_DARK: { id: 'BASEBOARD_DARK', provider: 'procedural', baseColor: 0x34373a, roughness: 0.62, metalness: 0, status: 'READY' },
  DOOR_WHITE: { id: 'DOOR_WHITE', provider: 'procedural', baseColor: 0xf4f1e9, roughness: 0.65, metalness: 0, status: 'READY' },
  DOOR_DARK: { id: 'DOOR_DARK', provider: 'procedural', baseColor: 0x34373a, roughness: 0.65, metalness: 0, status: 'READY' },
  FRAME_WHITE: { id: 'FRAME_WHITE', provider: 'procedural', baseColor: 0xeae7df, roughness: 0.52, metalness: 0, status: 'READY' },
  FRAME_BLACK: { id: 'FRAME_BLACK', provider: 'procedural', baseColor: 0x202326, roughness: 0.52, metalness: 0.15, status: 'READY' },
  WINDOW_GLASS: { id: 'WINDOW_GLASS', provider: 'procedural', baseColor: 0xc8d9e3, roughness: 0.08, metalness: 0, opacity: 0.28, transparent: true, status: 'READY' },
  LIGHT_FIXTURE: { id: 'LIGHT_FIXTURE', provider: 'procedural', baseColor: 0xf2eee6, roughness: 0.5, metalness: 0.05, status: 'READY' },
  FIXTURE_CERAMIC_WHITE: { id: 'FIXTURE_CERAMIC_WHITE', provider: 'procedural', baseColor: 0xf5f5f2, roughness: 0.28, metalness: 0, status: 'READY' },
  FIXTURE_METAL_DARK: { id: 'FIXTURE_METAL_DARK', provider: 'procedural', baseColor: 0x25282a, roughness: 0.38, metalness: 0.75, status: 'READY' },
  FIXTURE_GLASS: { id: 'FIXTURE_GLASS', provider: 'procedural', baseColor: 0xbfd7df, roughness: 0.12, metalness: 0, opacity: 0.3, transparent: true, status: 'READY' },
  FIXTURE_CABINET_NEUTRAL: { id: 'FIXTURE_CABINET_NEUTRAL', provider: 'procedural', baseColor: 0xe4e0d7, roughness: 0.68, metalness: 0, status: 'READY' },
  FIXTURE_APPLIANCE: { id: 'FIXTURE_APPLIANCE', provider: 'procedural', baseColor: 0xbfc2c3, roughness: 0.4, metalness: 0.6, status: 'READY' },
  TERRAIN_GRASS: { id: 'TERRAIN_GRASS', provider: 'polyhaven', assetSlug: 'leafy_grass', assetName: 'Leafy Grass', license: 'CC0', physicalWidthMeters: 2, physicalHeightMeters: 2, maps: pbr('assets/textures/leafy_grass'), baseColor: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.6, status: 'READY' },
};

export function getMaterialDefinition(id: MaterialId): MaterialDefinition {
  return MATERIAL_CATALOG[id];
}
