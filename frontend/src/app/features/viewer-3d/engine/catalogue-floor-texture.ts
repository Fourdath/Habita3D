import type { FloorCategory } from '../../../core/ep2/ep2.types';
import type { MaterialDefinition, ProceduralTextureSpec } from '../../../core/materials/material.types';
import { FLOOR_FINISHES, finishForPublication, type CatalogueFloorFinishId } from './floor-finishes';
import type { ProceduralTextureOptions } from './materials/procedural-texture-factory';

type Palette = Pick<ProceduralTextureSpec, 'color' | 'grout' | 'pattern'>;
type Profile = Palette & Pick<ProceduralTextureOptions, 'layout'>;

const FINISH_PALETTES: Record<CatalogueFloorFinishId, Palette> = {
  'ceramic-light': { color: '#cfd6d8', grout: '#aeb5b8' },
  'ceramic-graphite': { color: '#707175', grout: '#55575a' },
  'ceramic-wood': { color: '#b7906e', grout: '#8e745e', pattern: 'wood' },
  terracotta: { color: '#b56e4a', grout: '#8f5940' },
  marble: { color: '#e9e5df', grout: '#c5c0bb', pattern: 'marble' },
  oak: { color: '#ba9267', grout: '#8b674b', pattern: 'wood' },
  'laminate-gray': { color: '#aaa39b', grout: '#827d76', pattern: 'wood' },
  'laminate-dark': { color: '#71503b', grout: '#513a2b', pattern: 'wood' },
};

// The shop photos remain in the catalogue. These profiles describe indicative 3D finishes.
const CERAMIC_PRODUCTS: [RegExp, Profile][] = [
  [/\bmixtura\s+roble\b/, { color: '#ac7048', grout: '#805b44', pattern: 'wood', layout: 'basketweave' }],
  [/\bmadera\s+jona\b/, { color: '#c8a77e', grout: '#9f825f', pattern: 'wood' }],
  [/\bglaciar\s+negro\b/, { color: '#2c2c2a', grout: '#4c4a45' }],
  [/\bcalifornia\s+gris\b/, { color: '#aca99e', grout: '#8d8b82' }],
];

const LAMINATE_PRODUCTS: [RegExp, Profile][] = [
  [/\bferrara\s+wildlife\b/, { color: '#ac8055', grout: '#886849', pattern: 'wood' }],
  [/\belegance\s+roble\b/, { color: '#caaa7e', grout: '#a18a69', pattern: 'wood' }],
  [/\boak\s+brown\s+grey\b/, { color: '#90847a', grout: '#756a60', pattern: 'wood' }],
  [/\bsena\s+cafe\b/, { color: '#6c4d3b', grout: '#523b2d', pattern: 'wood' }],
];

export function catalogueFloorTexture(category: FloorCategory, publicationKey: string, name = ''): {
  definition: MaterialDefinition;
  options: ProceduralTextureOptions;
} {
  const words = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const finishId = finishForPublication(category, words);
  const finish = FLOOR_FINISHES.find(item => item.id === finishId)!;
  const ceramic = category === 'ceramic';
  const profiles = ceramic ? CERAMIC_PRODUCTS : LAMINATE_PRODUCTS;
  const profile: Profile = profiles.find(([pattern]) => pattern.test(words))?.[1] ?? FINISH_PALETTES[finishId];
  const [width, height] = ceramic ? ceramicDimensions(words) : [0.2, 1.2];

  return {
    definition: {
      id: finish.materialId,
      provider: 'procedural',
      procedural: { kind: 'tile', color: profile.color, grout: profile.grout, pattern: profile.pattern, tile: [width, height] },
      physicalWidthMeters: width * (ceramic ? 4 : 8),
      physicalHeightMeters: height * (ceramic ? 4 : 2),
      roughness: ceramic ? 0.47 : 0.57,
      metalness: 0,
      normalScale: ceramic ? 0.26 : 0.18,
      status: 'READY',
    },
    options: {
      size: 256,
      seed: [...publicationKey].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 0),
      layout: ceramic ? profile.layout : 'staggered',
    },
  };
}

function ceramicDimensions(name: string): [number, number] {
  const match = name.match(/\b(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:cm\s*)?[x×]\s*(\d{2,3}(?:[.,]\d{1,2})?)(?=\s*cm\b|\s|$)/);
  if (!match) return [0.6, 0.6];
  const width = Number(match[1].replace(',', '.')) / 100;
  const height = Number(match[2].replace(',', '.')) / 100;
  return width >= 0.1 && width <= 1.5 && height >= 0.1 && height <= 1.5 ? [width, height] : [0.6, 0.6];
}
