import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

import {
  SKY_MIE_COEFFICIENT,
  SKY_MIE_DIRECTIONAL_G,
  SKY_RAYLEIGH,
  SKY_SCALE,
  SKY_SUN_AZIMUTH_DEG,
  SKY_SUN_ELEVATION_DEG,
  SKY_TURBIDITY,
} from './environment.constants';

/** Fixed sun direction (unit vector) — no day/night cycle, shared by the sky and the sun-facing DirectionalLight. */
export function sunDirection(): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - SKY_SUN_ELEVATION_DEG);
  const theta = THREE.MathUtils.degToRad(SKY_SUN_AZIMUTH_DEG);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

/**
 * Physically-based sky dome (three.js's official Sky addon, Preetham model) with a
 * fixed, pleasant sun position. Clouds are explicitly disabled (cloudCoverage = 0) —
 * this Sky build includes a 2D noise cloud layer, which would read as an unwanted
 * "volumetric-ish" sky effect the prototype's scope excludes.
 */
export function createSky(): Sky {
  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  // Sky's vertex shader pins depth to the far plane regardless of the box's real
  // world-space position, but three.js's automatic frustum culling still runs against
  // the RAW (pre-shader) geometry bounds — once the player walks away from the
  // origin, that mismatch culls whichever face points away from the world origin,
  // punching a black hole in the sky exactly opposite the camera's offset. Standard
  // fix for any skybox-style object: disable frustum culling on it entirely.
  sky.frustumCulled = false;

  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = SKY_TURBIDITY;
  uniforms['rayleigh'].value = SKY_RAYLEIGH;
  uniforms['mieCoefficient'].value = SKY_MIE_COEFFICIENT;
  uniforms['mieDirectionalG'].value = SKY_MIE_DIRECTIONAL_G;
  uniforms['cloudCoverage'].value = 0;
  uniforms['sunPosition'].value.copy(sunDirection());

  return sky;
}
