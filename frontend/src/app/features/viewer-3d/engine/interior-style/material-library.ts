import * as THREE from 'three';

import type { InteriorStyle, MaterialSpec } from '../../../../core/interior-style/interior-style.types';
import { loadPbrTextureSet } from '../texture-cache';

/**
 * Turns an InteriorStyle's MaterialSpec (plain data) into real THREE materials for the
 * house's wall/floor meshes. Reuses texture-cache.ts, so switching between styles never
 * re-downloads/re-decodes a texture already used once. A fresh Material *wrapper* is
 * still created per style application (cheap — no shader recompilation, since the
 * underlying WebGLProgram is cached by three.js per material configuration) so wall and
 * floor meshes never share a mutable Material instance across styles (a color/map
 * change for one style must never bleed into another still-live material elsewhere).
 */

export interface HouseMaterials {
  interiorWall: THREE.Material;
  exteriorWall: THREE.Material;
  floor: THREE.Material;
  ceiling: THREE.Material;
  trim: THREE.Material;
  windowFrame: THREE.Material;
  glass: THREE.Material;
  fixture: THREE.Material;
}

const DEFAULT_INTERIOR_WALL_COLOR = 0xeee9df;
const DEFAULT_EXTERIOR_WALL_COLOR = 0xd8d1c5;
const DEFAULT_FLOOR_COLOR = 0xb9ab97;
const DEFAULT_CEILING_COLOR = 0xf4f1ea;

/** The plain, untextured look floorplan-geometry.ts uses by default — restored when styleId is 'none'. */
export function createDefaultHouseMaterials(): HouseMaterials {
  return {
    interiorWall: solidMaterial(DEFAULT_INTERIOR_WALL_COLOR, 0.92),
    exteriorWall: solidMaterial(DEFAULT_EXTERIOR_WALL_COLOR, 0.96),
    floor: new THREE.MeshStandardMaterial({ color: DEFAULT_FLOOR_COLOR, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    ceiling: solidMaterial(DEFAULT_CEILING_COLOR, 0.98),
    trim: solidMaterial(0xf4f1e9, 0.65),
    windowFrame: solidMaterial(0xe8e4da, 0.58),
    glass: createGlassMaterial(),
    fixture: createFixtureMaterial(0xf2eee6, 0xffd39b, 1.2),
  };
}

export async function buildHouseMaterials(style: InteriorStyle, rendererMaxAnisotropy: number): Promise<HouseMaterials> {
  const [interiorWall, exteriorWall, floor, ceiling] = await Promise.all([
    buildSurfaceMaterial(style.interiorWallMaterial, rendererMaxAnisotropy, DEFAULT_INTERIOR_WALL_COLOR),
    buildSurfaceMaterial(style.exteriorWallMaterial, rendererMaxAnisotropy, DEFAULT_EXTERIOR_WALL_COLOR),
    buildSurfaceMaterial(style.floorMaterial, rendererMaxAnisotropy, DEFAULT_FLOOR_COLOR),
    buildSurfaceMaterial(style.ceilingMaterial, rendererMaxAnisotropy, DEFAULT_CEILING_COLOR),
  ]);
  const lighting = style.lighting;
  return {
    interiorWall,
    exteriorWall,
    floor,
    ceiling,
    trim: solidMaterial(style.trimColor, 0.62),
    windowFrame: solidMaterial(style.windowFrameColor, 0.52),
    glass: createGlassMaterial(),
    fixture: createFixtureMaterial(
      lighting?.fixtureColor ?? 0xf2eee6,
      lighting?.roomLightColor ?? 0xffd39b,
      lighting?.fixtureEmissiveIntensity ?? 1.2,
    ),
  };
}

/** Never rejects — a failed texture load falls back to the spec's flat fallbackColor. */
async function buildSurfaceMaterial(
  spec: MaterialSpec | null,
  rendererMaxAnisotropy: number,
  defaultColor: number,
): Promise<THREE.Material> {
  if (!spec) {
    return new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  }

  try {
    const textures = await loadPbrTextureSet({
      basePath: spec.texturePath,
      repeat: [1 / spec.tileMeters, 1 / spec.tileMeters],
      anisotropy: rendererMaxAnisotropy,
    });
    const common: THREE.MeshStandardMaterialParameters = {
      map: textures.diffuse,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      normalScale: new THREE.Vector2(spec.normalScale ?? 0.35, spec.normalScale ?? 0.35),
      roughness: spec.roughness ?? 0.9,
      metalness: 0,
      // FrontSide, not DoubleSide: every wall/floor mesh here is a proper closed solid
      // from ExtrudeGeometry with correctly-oriented outward normals, so there's no
      // legitimate backface to view. DoubleSide combined with a normalMap renders
      // backfaces (auto-flipped geometric normal, but NOT the tangent basis) as
      // solid black under certain viewing angles — confirmed visually.
    };
    return spec.clearcoat
      ? new THREE.MeshPhysicalMaterial({
          ...common,
          clearcoat: spec.clearcoat,
          clearcoatRoughness: spec.clearcoatRoughness ?? 0.5,
        })
      : new THREE.MeshStandardMaterial(common);
  } catch (error) {
    console.error(`No se pudo cargar la textura ${spec.texturePath}; se usa un color plano de respaldo.`, error);
    return new THREE.MeshStandardMaterial({ color: spec.fallbackColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  }
}

function solidMaterial(color: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function createGlassMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc8d9e3,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
}

function createFixtureMaterial(color: number, emissive: number, emissiveIntensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.05,
    emissive,
    emissiveIntensity,
  });
}
