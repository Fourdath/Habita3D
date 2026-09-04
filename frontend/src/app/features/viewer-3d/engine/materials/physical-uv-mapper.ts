import * as THREE from 'three';

export type MetricUvPlane = 'XY' | 'XZ';

/** Writes world-unit UVs; MaterialRegistry scales the shared texture by its physical size. */
export function applyMetricPlanarUvs(geometry: THREE.BufferGeometry, plane: MetricUvPlane): void {
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index++) {
    uv[index * 2] = positions.getX(index);
    uv[index * 2 + 1] = plane === 'XY' ? positions.getY(index) : -positions.getZ(index);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
