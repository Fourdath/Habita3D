import * as THREE from 'three';

/**
 * Shared PBR texture loading + caching, used by both the exterior terrain
 * (environment-manager.ts) and the interior style material library (Phase 4). A
 * texture is only ever fetched/decoded once per URL, however many times a style is
 * switched back and forth — callers get the same THREE.Texture instance back.
 */

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<THREE.Texture>>();

function loadCachedTexture(url: string): Promise<THREE.Texture> {
  let pending = textureCache.get(url);
  if (!pending) {
    pending = textureLoader.loadAsync(url);
    textureCache.set(url, pending);
  }
  return pending;
}

export interface PbrTextureSet {
  diffuse: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
}

export interface LoadPbrTextureSetOptions {
  /** Base directory containing diffuse.<ext>/normal.<ext>/roughness.<ext>, e.g. 'assets/textures/oak_wood_planks'. */
  basePath: string;
  diffuseFile?: string;
  normalFile?: string;
  roughnessFile?: string;
  /** How many repeats along X/Y so the texture reads at a believable physical scale. */
  repeat: [number, number];
  anisotropy?: number;
}

/**
 * Loads (or reuses from cache) a diffuse/normal/roughness set and configures each
 * texture correctly for MeshStandardMaterial: diffuse is color data (SRGBColorSpace),
 * normal/roughness are non-color data (left as THREE's default linear color space).
 * Every texture gets RepeatWrapping and the requested tiling.
 */
export async function loadPbrTextureSet(options: LoadPbrTextureSetOptions): Promise<PbrTextureSet> {
  const diffuseFile = options.diffuseFile ?? 'diffuse.jpg';
  const normalFile = options.normalFile ?? 'normal.png';
  const roughnessFile = options.roughnessFile ?? 'roughness.jpg';

  const [diffuse, normal, roughness] = await Promise.all([
    loadCachedTexture(`${options.basePath}/${diffuseFile}`),
    loadCachedTexture(`${options.basePath}/${normalFile}`),
    loadCachedTexture(`${options.basePath}/${roughnessFile}`),
  ]);

  diffuse.colorSpace = THREE.SRGBColorSpace;
  // Normal/roughness are data maps, not colors — left in linear space (THREE's default).

  for (const texture of [diffuse, normal, roughness]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(options.repeat[0], options.repeat[1]);
    if (options.anisotropy) {
      texture.anisotropy = options.anisotropy;
    }
    texture.needsUpdate = true;
  }

  return { diffuse, normal, roughness };
}
