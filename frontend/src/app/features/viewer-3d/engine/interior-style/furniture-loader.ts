import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads (and caches per URL) furniture GLBs — never re-fetched/re-parsed once a model
 * has been loaded once, however many times a style is applied. Callers get a fresh
 * `clone(true)` per call: cloning an Object3D duplicates the scene-graph/transform
 * hierarchy but *shares* the underlying geometry/material buffers with the cached
 * original, so many placed instances of the same model share GPU memory — which is
 * also why furniture item disposal must never call geometry/material.dispose() on
 * these cloned meshes (see furniture-layout-builder.ts's disposeFurnitureGroup()).
 */

const gltfLoader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D>>();

export async function loadFurnitureModel(url: string): Promise<THREE.Object3D> {
  let pending = modelCache.get(url);
  if (!pending) {
    pending = gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
    modelCache.set(url, pending);
  }

  try {
    const original = await pending;
    return original.clone(true);
  } catch (error) {
    // Don't leave a rejected promise cached forever — a transient failure shouldn't
    // permanently block this model from ever loading again.
    modelCache.delete(url);
    throw error;
  }
}
