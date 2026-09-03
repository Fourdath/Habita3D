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
  wall: THREE.Material;
  floor: THREE.Material;
}

const DEFAULT_WALL_COLOR = 0xe4ded2;
const DEFAULT_FLOOR_COLOR = 0xb9ab97;
const WALL_TEXTURE_REPEAT: [number, number] = [4, 4];
const FLOOR_TEXTURE_REPEAT: [number, number] = [6, 6];

/** The plain, untextured look floorplan-geometry.ts uses by default — restored when styleId is 'none'. */
export function createDefaultHouseMaterials(): HouseMaterials {
  return {
    wall: new THREE.MeshStandardMaterial({ color: DEFAULT_WALL_COLOR, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ color: DEFAULT_FLOOR_COLOR, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  };
}

export async function buildHouseMaterials(style: InteriorStyle, rendererMaxAnisotropy: number): Promise<HouseMaterials> {
  const [wall, floor] = await Promise.all([
    buildSurfaceMaterial(style.wallMaterial, WALL_TEXTURE_REPEAT, rendererMaxAnisotropy, DEFAULT_WALL_COLOR),
    buildSurfaceMaterial(style.floorMaterial, FLOOR_TEXTURE_REPEAT, rendererMaxAnisotropy, DEFAULT_FLOOR_COLOR),
  ]);
  return { wall, floor };
}

/** Never rejects — a failed texture load falls back to the spec's flat fallbackColor. */
async function buildSurfaceMaterial(
  spec: MaterialSpec | null,
  repeat: [number, number],
  rendererMaxAnisotropy: number,
  defaultColor: number,
): Promise<THREE.Material> {
  if (!spec) {
    return new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  }

  try {
    const textures = await loadPbrTextureSet({
      basePath: spec.texturePath,
      repeat,
      anisotropy: rendererMaxAnisotropy,
    });
    return new THREE.MeshStandardMaterial({
      map: textures.diffuse,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      roughness: 1,
      // FrontSide, not DoubleSide: every wall/floor mesh here is a proper closed solid
      // from ExtrudeGeometry with correctly-oriented outward normals, so there's no
      // legitimate backface to view. DoubleSide combined with a normalMap renders
      // backfaces (auto-flipped geometric normal, but NOT the tangent basis) as
      // solid black under certain viewing angles — confirmed visually.
    });
  } catch (error) {
    console.error(`No se pudo cargar la textura ${spec.texturePath}; se usa un color plano de respaldo.`, error);
    return new THREE.MeshStandardMaterial({ color: spec.fallbackColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  }
}
