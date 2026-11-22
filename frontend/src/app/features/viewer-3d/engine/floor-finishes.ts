import type { FloorCategory } from '../../../core/ep2/ep2.types';
import type { MaterialId } from '../../../core/materials/material.types';

interface FloorFinish {
  id: string;
  label: string;
  swatch: string;
  preview: string;
  category: FloorCategory | null;
  materialId: MaterialId;
}

const tilePreview = 'linear-gradient(90deg, transparent 94%, #0003 94%), linear-gradient(transparent 92%, #0003 92%)';
const woodPreview = 'repeating-linear-gradient(8deg, #0002 0 1px, transparent 1px 6px, #fff3 6px 7px, transparent 7px 10px)';

export const FLOOR_FINISHES = [
  { id: 'ceramic-light', label: 'Cerámica perla', swatch: '#cfd6d8', preview: tilePreview, category: 'ceramic', materialId: 'NORDIC_BATH_FLOOR_TILE_LIGHT' },
  { id: 'ceramic-graphite', label: 'Cerámica grafito', swatch: '#6b7175', preview: tilePreview, category: 'ceramic', materialId: 'INDUSTRIAL_BATH_FLOOR_TILE_GRAY' },
  { id: 'terracotta', label: 'Terracota', swatch: '#b86543', preview: tilePreview, category: 'ceramic', materialId: 'FLOOR_TILE_TERRACOTTA' },
  { id: 'marble', label: 'Cerámica marmoleada', swatch: '#e8e4df', preview: 'repeating-linear-gradient(126deg, transparent 0 12px, #85818377 13px, transparent 15px 21px)', category: 'ceramic', materialId: 'FLOOR_TILE_MARBLE' },
  { id: 'ceramic-wood', label: 'Cerámica tipo madera', swatch: '#b38a64', preview: woodPreview, category: 'ceramic', materialId: 'FLOOR_TILE_WOOD' },
  { id: 'oak', label: 'Roble claro', swatch: '#c8a578', preview: woodPreview, category: 'laminate', materialId: 'NORDIC_FLOOR_WOOD_LIGHT' },
  { id: 'laminate-dark', label: 'Laminado oscuro', swatch: '#604936', preview: woodPreview, category: 'laminate', materialId: 'INDUSTRIAL_FLOOR_WOOD_DARK' },
  { id: 'laminate-gray', label: 'Laminado ceniza', swatch: '#aaa39b', preview: woodPreview, category: 'laminate', materialId: 'FLOOR_LAMINATE_ASH' },
  { id: 'concrete', label: 'Hormigón pulido', swatch: '#96928c', preview: 'radial-gradient(ellipse at 30% 35%, #fff4, transparent 75%), radial-gradient(ellipse at 80% 75%, #0003, transparent 60%)', category: null, materialId: 'FLOOR_CONCRETE_SMOOTH' },
] as const satisfies readonly FloorFinish[];

export type FloorFinishId = (typeof FLOOR_FINISHES)[number]['id'];

/** Picks a reference finish from explicit words in the published name. */
export function finishForPublication(category: FloorCategory, name: string): FloorFinishId {
  const words = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (category === 'laminate') {
    if (/\b(?:ceniza|gris|gray|grey|ash)\b/.test(words)) return 'laminate-gray';
    if (/\b(?:oscuro|oscura|nogal|wenge|walnut|chocolate|ebano|cafe)\b/.test(words)) return 'laminate-dark';
    return 'oak';
  }

  if (/\b(?:marmol|marmoleado|marmoleada|marble|carrara|calacatta)\b/.test(words)) return 'marble';
  if (/\b(?:terracota|terracotta|barro|cotto|arcilla)\b/.test(words)) return 'terracotta';
  if (/\b(?:madera|roble|nogal|parquet|wood|deck|duela)\b/.test(words)) return 'ceramic-wood';
  if (/\b(?:gris|grafito|antracita|negro|negra|black|gray|grey|pizarra)\b/.test(words)) return 'ceramic-graphite';
  return 'ceramic-light';
}
