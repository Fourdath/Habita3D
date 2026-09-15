import * as THREE from 'three';

export type UvPlane = 'XZ' | 'XY' | 'ZY';

/**
 * UVs in METERS. The visual scale of a finish is then set once by the material
 * (repeat = 1 / physical size), so two walls of different length keep the same tile
 * size and no mesh needs its own magic repeat.
 */
export function applyMetricPlanarUvs(geometry: THREE.BufferGeometry, plane: UvPlane): void {
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index++) {
    if (plane === 'XZ') {
      uv[index * 2] = positions.getX(index);
      uv[index * 2 + 1] = -positions.getZ(index);
    } else if (plane === 'XY') {
      uv[index * 2] = positions.getX(index);
      uv[index * 2 + 1] = positions.getY(index);
    } else {
      uv[index * 2] = positions.getZ(index);
      uv[index * 2 + 1] = positions.getY(index);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Metric UVs for an arbitrary box or extrusion: every face takes its dominant plane.
 * `offset` adds the mesh's world position so a run of boxes reads as one continuous
 * surface instead of restarting the pattern per mesh.
 */
export function applyMetricBoxUvs(
  geometry: THREE.BufferGeometry, offset: [number, number, number] = [0, 0, 0],
): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!normals) geometry.computeVertexNormals();
  const resolvedNormals = geometry.getAttribute('normal');
  const uv = new Float32Array(positions.count * 2);

  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index) + offset[0];
    const y = positions.getY(index) + offset[1];
    const z = positions.getZ(index) + offset[2];
    const nx = Math.abs(resolvedNormals.getX(index));
    const ny = Math.abs(resolvedNormals.getY(index));
    const nz = Math.abs(resolvedNormals.getZ(index));

    if (ny >= nx && ny >= nz) {
      uv[index * 2] = x;
      uv[index * 2 + 1] = z;
    } else if (nx >= nz) {
      uv[index * 2] = z;
      uv[index * 2 + 1] = y;
    } else {
      uv[index * 2] = x;
      uv[index * 2 + 1] = y;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
