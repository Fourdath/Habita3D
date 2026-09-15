import type { MaterialDefinition, MaterialId, MaterialTextureMaps, ProceduralTextureSpec } from './material.types';

const TEXTURE_ROOT = 'assets/textures';

const pbr = (slug: string): MaterialTextureMaps => ({
  albedo: `${TEXTURE_ROOT}/${slug}/diffuse.jpg`,
  normalGl: `${TEXTURE_ROOT}/${slug}/normal.png`,
  roughness: `${TEXTURE_ROOT}/${slug}/roughness.jpg`,
});

const procedural = (spec: ProceduralTextureSpec): ProceduralTextureSpec => spec;

/**
 * A MaterialId is a VISUAL FINISH — nothing else. The construction system lives in
 * core/construction (wall assemblies) and the purchasable product in core/budget.
 *
 * MATERIAL_NOT_CONFIGURED is magenta on purpose, but nothing resolves to it any more:
 * every finish role has a value in every style preset, so it only appears when a
 * diagnostic overlay asks for it explicitly.
 */
export const MATERIAL_CATALOG: Record<MaterialId, MaterialDefinition> = {
  TERRAIN_GRASS: { id: 'TERRAIN_GRASS', provider: 'polyhaven', assetSlug: 'leafy_grass', license: 'CC0', physicalWidthMeters: 2, physicalHeightMeters: 2, maps: pbr('leafy_grass'), baseColor: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.6, status: 'READY' },
  MATERIAL_NOT_CONFIGURED: { id: 'MATERIAL_NOT_CONFIGURED', provider: 'procedural', baseColor: 0xff00ff, roughness: 1, metalness: 0, status: 'NOT_CONFIGURED' },
  DEFAULT_WALL_NEUTRAL: { id: 'DEFAULT_WALL_NEUTRAL', provider: 'procedural', baseColor: 0xeee9df, roughness: 0.92, metalness: 0, status: 'READY' },
  DEFAULT_FLOOR_NEUTRAL: { id: 'DEFAULT_FLOOR_NEUTRAL', provider: 'procedural', baseColor: 0xb9ab97, roughness: 0.9, metalness: 0, status: 'READY' },
  DEFAULT_EXTERIOR_NEUTRAL: { id: 'DEFAULT_EXTERIOR_NEUTRAL', provider: 'procedural', baseColor: 0xd8d1c5, roughness: 0.96, metalness: 0, status: 'READY' },
  /** Structural core of a wall: visible only where a finish face is missing. */
  WALL_CORE_STRUCTURE: { id: 'WALL_CORE_STRUCTURE', provider: 'procedural', baseColor: 0xd9d4ca, roughness: 0.95, metalness: 0, status: 'READY' },

  NORDIC_WALL_PASTEL_BLUE: { id: 'NORDIC_WALL_PASTEL_BLUE', provider: 'procedural', procedural: procedural({ kind: 'paint', color: '#c6dcea' }), physicalWidthMeters: 1.5, physicalHeightMeters: 1.5, baseColor: 0xffffff, roughness: 0.94, metalness: 0, normalScale: 0.15, status: 'READY' },
  NORDIC_FLOOR_WOOD_LIGHT: { id: 'NORDIC_FLOOR_WOOD_LIGHT', provider: 'polyhaven', assetSlug: 'oak_wood_planks', license: 'CC0', maps: pbr('oak_wood_planks'), physicalWidthMeters: 1.2, physicalHeightMeters: 1.2, baseColor: 0xffffff, roughness: 0.45, metalness: 0, normalScale: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.5, status: 'READY' },
  NORDIC_BATH_WALL_TILE_LIGHT: { id: 'NORDIC_BATH_WALL_TILE_LIGHT', provider: 'procedural', procedural: procedural({ kind: 'tile', tile: [0.3, 0.6], color: '#f2f4f3', grout: '#d8dcdb' }), physicalWidthMeters: 1.2, physicalHeightMeters: 1.2, baseColor: 0xffffff, roughness: 0.32, metalness: 0, normalScale: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.25, status: 'READY' },
  NORDIC_BATH_FLOOR_TILE_LIGHT: { id: 'NORDIC_BATH_FLOOR_TILE_LIGHT', provider: 'procedural', procedural: procedural({ kind: 'tile', tile: [0.6, 0.6], color: '#cfd6d8', grout: '#adb5b8' }), physicalWidthMeters: 1.2, physicalHeightMeters: 1.2, baseColor: 0xffffff, roughness: 0.4, metalness: 0, normalScale: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.3, status: 'READY' },
  NORDIC_KITCHEN_BACKSPLASH_LIGHT: { id: 'NORDIC_KITCHEN_BACKSPLASH_LIGHT', provider: 'procedural', procedural: procedural({ kind: 'tile', tile: [0.15, 0.075], color: '#f6f6f2', grout: '#dcdcd4' }), physicalWidthMeters: 0.6, physicalHeightMeters: 0.6, baseColor: 0xffffff, roughness: 0.3, metalness: 0, normalScale: 0.6, clearcoat: 0.4, clearcoatRoughness: 0.2, status: 'READY' },
  NORDIC_KITCHEN_CABINET: { id: 'NORDIC_KITCHEN_CABINET', provider: 'procedural', procedural: procedural({ kind: 'paint', color: '#eeeae1' }), physicalWidthMeters: 1, physicalHeightMeters: 1, baseColor: 0xffffff, roughness: 0.55, metalness: 0, normalScale: 0.12, status: 'READY' },
  NORDIC_COUNTERTOP: { id: 'NORDIC_COUNTERTOP', provider: 'procedural', procedural: procedural({ kind: 'stone', color: '#d5d2cb' }), physicalWidthMeters: 1.4, physicalHeightMeters: 1.4, baseColor: 0xffffff, roughness: 0.38, metalness: 0, normalScale: 0.25, clearcoat: 0.3, clearcoatRoughness: 0.35, status: 'READY' },
  NORDIC_EXTERIOR_LIGHT: { id: 'NORDIC_EXTERIOR_LIGHT', provider: 'procedural', procedural: procedural({ kind: 'stucco', color: '#e8e4dc' }), physicalWidthMeters: 2, physicalHeightMeters: 2, baseColor: 0xffffff, roughness: 0.96, metalness: 0, normalScale: 0.4, status: 'READY' },

  INDUSTRIAL_WALL_CREAM: { id: 'INDUSTRIAL_WALL_CREAM', provider: 'procedural', procedural: procedural({ kind: 'paint', color: '#c4b09a' }), physicalWidthMeters: 1.5, physicalHeightMeters: 1.5, baseColor: 0xffffff, roughness: 0.93, metalness: 0, normalScale: 0.18, status: 'READY' },
  INDUSTRIAL_FLOOR_WOOD_DARK: { id: 'INDUSTRIAL_FLOOR_WOOD_DARK', provider: 'polyhaven', assetSlug: 'laminate_floor_02', license: 'CC0', maps: pbr('laminate_floor_02'), physicalWidthMeters: 1.7, physicalHeightMeters: 1.7, baseColor: 0x7c6550, roughness: 0.5, metalness: 0, normalScale: 0.4, clearcoat: 0.1, clearcoatRoughness: 0.55, status: 'READY' },
  INDUSTRIAL_WALL_BRICK_EXPOSED: { id: 'INDUSTRIAL_WALL_BRICK_EXPOSED', provider: 'polyhaven', assetSlug: 'brick_wall_003', license: 'CC0', maps: pbr('brick_wall_003'), physicalWidthMeters: 4, physicalHeightMeters: 4, baseColor: 0xffffff, roughness: 0.92, metalness: 0, normalScale: 0.55, status: 'READY' },
  INDUSTRIAL_WALL_CONCRETE_VISIBLE: { id: 'INDUSTRIAL_WALL_CONCRETE_VISIBLE', provider: 'polyhaven', assetSlug: 'rough_concrete', license: 'CC0', maps: pbr('rough_concrete'), physicalWidthMeters: 1.23, physicalHeightMeters: 1.23, baseColor: 0xffffff, roughness: 0.9, metalness: 0, normalScale: 0.35, status: 'READY' },
  INDUSTRIAL_BATH_WALL_TILE_GRAY: { id: 'INDUSTRIAL_BATH_WALL_TILE_GRAY', provider: 'procedural', procedural: procedural({ kind: 'tile', tile: [0.3, 0.6], color: '#9aa0a3', grout: '#6f7477' }), physicalWidthMeters: 1.2, physicalHeightMeters: 1.2, baseColor: 0xffffff, roughness: 0.34, metalness: 0, normalScale: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.28, status: 'READY' },
  INDUSTRIAL_BATH_FLOOR_TILE_GRAY: { id: 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY', provider: 'procedural', procedural: procedural({ kind: 'tile', tile: [0.6, 0.6], color: '#6b7175', grout: '#4c5154' }), physicalWidthMeters: 1.2, physicalHeightMeters: 1.2, baseColor: 0xffffff, roughness: 0.42, metalness: 0, normalScale: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.35, status: 'READY' },
  INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY: { id: 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY', provider: 'procedural', procedural: procedural({ kind: 'tile', tile: [0.2, 0.1], color: '#8d9295', grout: '#63686b' }), physicalWidthMeters: 0.8, physicalHeightMeters: 0.8, baseColor: 0xffffff, roughness: 0.32, metalness: 0, normalScale: 0.6, clearcoat: 0.35, clearcoatRoughness: 0.25, status: 'READY' },
  INDUSTRIAL_KITCHEN_CABINET: { id: 'INDUSTRIAL_KITCHEN_CABINET', provider: 'procedural', procedural: procedural({ kind: 'paint', color: '#3f4245' }), physicalWidthMeters: 1, physicalHeightMeters: 1, baseColor: 0xffffff, roughness: 0.5, metalness: 0.05, normalScale: 0.12, status: 'READY' },
  INDUSTRIAL_COUNTERTOP: { id: 'INDUSTRIAL_COUNTERTOP', provider: 'procedural', procedural: procedural({ kind: 'stone', color: '#5c5f61' }), physicalWidthMeters: 1.4, physicalHeightMeters: 1.4, baseColor: 0xffffff, roughness: 0.42, metalness: 0.05, normalScale: 0.25, status: 'READY' },
  INDUSTRIAL_EXTERIOR: { id: 'INDUSTRIAL_EXTERIOR', provider: 'procedural', procedural: procedural({ kind: 'stucco', color: '#b9ada0' }), physicalWidthMeters: 2, physicalHeightMeters: 2, baseColor: 0xffffff, roughness: 0.95, metalness: 0, normalScale: 0.4, status: 'READY' },

  CEILING_WHITE: { id: 'CEILING_WHITE', provider: 'procedural', baseColor: 0xf7f7f5, roughness: 0.98, metalness: 0, status: 'READY' },
  BASEBOARD_WHITE: { id: 'BASEBOARD_WHITE', provider: 'procedural', baseColor: 0xfbfaf6, roughness: 0.45, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4, status: 'READY' },
  BASEBOARD_DARK: { id: 'BASEBOARD_DARK', provider: 'procedural', baseColor: 0x34373a, roughness: 0.5, metalness: 0, status: 'READY' },
  DOOR_WHITE: { id: 'DOOR_WHITE', provider: 'procedural', baseColor: 0xf4f1e9, roughness: 0.6, metalness: 0, status: 'READY' },
  DOOR_DARK: { id: 'DOOR_DARK', provider: 'procedural', baseColor: 0x34373a, roughness: 0.6, metalness: 0, status: 'READY' },
  FRAME_WHITE: { id: 'FRAME_WHITE', provider: 'procedural', baseColor: 0xeae7df, roughness: 0.5, metalness: 0, status: 'READY' },
  FRAME_BLACK: { id: 'FRAME_BLACK', provider: 'procedural', baseColor: 0x202326, roughness: 0.5, metalness: 0.15, status: 'READY' },
  WINDOW_GLASS: { id: 'WINDOW_GLASS', provider: 'procedural', baseColor: 0xc8d9e3, roughness: 0.06, metalness: 0, opacity: 0.24, transparent: true, status: 'READY' },
  LIGHT_FIXTURE: { id: 'LIGHT_FIXTURE', provider: 'procedural', baseColor: 0xf2eee6, roughness: 0.5, metalness: 0.05, emissive: 0xffd8a8, emissiveIntensity: 1.1, status: 'READY' },
  FIXTURE_CERAMIC_WHITE: { id: 'FIXTURE_CERAMIC_WHITE', provider: 'procedural', baseColor: 0xf7f7f4, roughness: 0.16, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12, status: 'READY' },
  FIXTURE_METAL_DARK: { id: 'FIXTURE_METAL_DARK', provider: 'procedural', baseColor: 0x2b2e30, roughness: 0.32, metalness: 0.8, status: 'READY' },
  FIXTURE_METAL_CHROME: { id: 'FIXTURE_METAL_CHROME', provider: 'procedural', baseColor: 0xd6dade, roughness: 0.14, metalness: 0.95, status: 'READY' },
  FIXTURE_GLASS: { id: 'FIXTURE_GLASS', provider: 'procedural', baseColor: 0xd3e4ea, roughness: 0.05, metalness: 0, opacity: 0.2, transparent: true, status: 'READY' },
  FIXTURE_APPLIANCE: { id: 'FIXTURE_APPLIANCE', provider: 'procedural', baseColor: 0xbfc2c3, roughness: 0.35, metalness: 0.65, status: 'READY' },
  TOE_KICK_DARK: { id: 'TOE_KICK_DARK', provider: 'procedural', baseColor: 0x3a3d3f, roughness: 0.6, metalness: 0, status: 'READY' },
};

export const getMaterialDefinition = (id: MaterialId): MaterialDefinition =>
  MATERIAL_CATALOG[id] ?? MATERIAL_CATALOG.DEFAULT_WALL_NEUTRAL;

/** Finishes that are purchased as ceramic tile — the budget's only tile trigger. */
const CERAMIC_MATERIALS = new Set<MaterialId>([
  'NORDIC_BATH_WALL_TILE_LIGHT', 'NORDIC_BATH_FLOOR_TILE_LIGHT', 'NORDIC_KITCHEN_BACKSPLASH_LIGHT',
  'INDUSTRIAL_BATH_WALL_TILE_GRAY', 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY', 'INDUSTRIAL_KITCHEN_BACKSPLASH_GRAY',
]);

export const isCeramicFinish = (materialId: MaterialId): boolean => CERAMIC_MATERIALS.has(materialId);
