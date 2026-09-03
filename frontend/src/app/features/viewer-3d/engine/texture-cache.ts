import * as THREE from 'three';

/**
 * Shared PBR texture loading + caching, used by both the exterior terrain
 * (environment-manager.ts) and the interior style material library (Phase 4). A
 * texture is only ever fetched/decoded once per URL, however many times a style is
 * switched back and forth — callers get the same THREE.Texture instance back.
 */

const textureLoader = new THREE.TextureLoader();
const sourceTextureCache = new Map<string, Promise<THREE.Texture>>();
const configuredTextureCache = new Map<string, Promise<THREE.Texture>>();

function loadCachedTexture(url: string): Promise<THREE.Texture> {
  let pending = sourceTextureCache.get(url);
  if (!pending) {
    pending = textureLoader.loadAsync(url);
    sourceTextureCache.set(url, pending);
  }
  return pending;
}

function loadConfiguredTexture(
  url: string,
  repeat: [number, number],
  anisotropy: number,
  colorSpace: THREE.ColorSpace,
): Promise<THREE.Texture> {
  const key = `${url}|${repeat[0]}:${repeat[1]}|${anisotropy}|${colorSpace}`;
  let pending = configuredTextureCache.get(key);
  if (!pending) {
    pending = loadCachedTexture(url).then((source) => {
      const texture = source.clone();
      texture.colorSpace = colorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
      return texture;
    });
    configuredTextureCache.set(key, pending);
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
  const anisotropy = options.anisotropy ?? 1;

  const [diffuse, normal, roughness] = await Promise.all([
    loadConfiguredTexture(`${options.basePath}/${diffuseFile}`, options.repeat, anisotropy, THREE.SRGBColorSpace),
    loadConfiguredTexture(`${options.basePath}/${normalFile}`, options.repeat, anisotropy, THREE.NoColorSpace),
    loadConfiguredTexture(`${options.basePath}/${roughnessFile}`, options.repeat, anisotropy, THREE.NoColorSpace),
  ]);

  return { diffuse, normal, roughness };
}
