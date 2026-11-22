import * as THREE from 'three';

export function isSurfaceTint(color: string | null | undefined): color is string {
  return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color);
}

/** Recolors a surface while retaining its texture detail and sharing its maps. */
export function createTintedSurfaceMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = base.clone();
  material.onBeforeCompile = shader => {
    const luminanceMap = THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', `
      float detail = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      sampledDiffuseColor.rgb = vec3(mix(0.47, 1.28, sqrt(clamp(detail, 0.0, 1.0))));
      diffuseColor *= sampledDiffuseColor;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', luminanceMap);
  };
  material.customProgramCacheKey = () => 'surface-tint-luminance';
  return material;
}
