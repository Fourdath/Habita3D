import * as THREE from 'three';

import type { MaterialDefinition } from '../../../../core/materials/material.types';

export interface ProceduralTextureSet {
  map: THREE.Texture;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
}

const SIZE = 1024;

/**
 * Canvas-drawn stand-ins for finishes we have no PBR asset for (paint, tile, stucco,
 * stone). Drawn at the material's physical size so a 30 × 60 tile really is 30 × 60.
 */
export function drawProceduralTexture(definition: MaterialDefinition): ProceduralTextureSet {
  const spec = definition.procedural;
  if (!spec) throw new Error(`${definition.id} has no procedural spec`);

  const albedoCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  albedoCanvas.width = albedoCanvas.height = SIZE;
  heightCanvas.width = heightCanvas.height = SIZE;
  const albedo = albedoCanvas.getContext('2d');
  const height = heightCanvas.getContext('2d');
  if (!albedo || !height) throw new Error('2D canvas context unavailable');

  height.fillStyle = '#808080';
  height.fillRect(0, 0, SIZE, SIZE);

  if (spec.kind === 'tile') {
    const [tileWidth, tileHeight] = spec.tile ?? [0.3, 0.3];
    const columns = Math.max(1, Math.round((definition.physicalWidthMeters ?? 1) / tileWidth));
    const rows = Math.max(1, Math.round((definition.physicalHeightMeters ?? 1) / tileHeight));
    const cellWidth = SIZE / columns;
    const cellHeight = SIZE / rows;
    albedo.fillStyle = spec.grout ?? '#cccccc';
    albedo.fillRect(0, 0, SIZE, SIZE);
    height.fillStyle = '#404040';
    height.fillRect(0, 0, SIZE, SIZE);
    const groutPx = Math.max(2, Math.round(Math.min(cellWidth, cellHeight) * 0.035));
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        albedo.fillStyle = shadeHex(spec.color, 1 + (Math.random() - 0.5) * 0.05);
        albedo.fillRect(column * cellWidth + groutPx, row * cellHeight + groutPx, cellWidth - groutPx * 2, cellHeight - groutPx * 2);
        height.fillStyle = '#c8c8c8';
        height.fillRect(column * cellWidth + groutPx, row * cellHeight + groutPx, cellWidth - groutPx * 2, cellHeight - groutPx * 2);
      }
    }
    speckle(albedo, 0.02, 900);
  } else if (spec.kind === 'paint') {
    albedo.fillStyle = spec.color;
    albedo.fillRect(0, 0, SIZE, SIZE);
    speckle(albedo, 0.012, 5000);
  } else if (spec.kind === 'stucco') {
    albedo.fillStyle = spec.color;
    albedo.fillRect(0, 0, SIZE, SIZE);
    speckle(albedo, 0.05, 45000);
    speckle(height, 0.12, 30000);
  } else {
    albedo.fillStyle = spec.color;
    albedo.fillRect(0, 0, SIZE, SIZE);
    for (let index = 0; index < 2600; index++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const radius = Math.random() * 5 + 1;
      albedo.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
      albedo.beginPath();
      albedo.arc(x, y, radius, 0, Math.PI * 2);
      albedo.fill();
      albedo.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      albedo.beginPath();
      albedo.arc(SIZE - x, SIZE - y, radius * 0.8, 0, Math.PI * 2);
      albedo.fill();
    }
    speckle(height, 0.05, 20000);
  }

  return {
    map: new THREE.CanvasTexture(albedoCanvas),
    // Paint gets no relief: a noisy height map read as coarse stucco on every wall.
    normal: spec.kind === 'paint' ? null : normalFromHeight(heightCanvas),
    roughness: null,
  };
}

function speckle(context: CanvasRenderingContext2D, strength: number, count: number): void {
  for (let index = 0; index < count; index++) {
    const value = Math.random() < 0.5 ? 0 : 255;
    context.fillStyle = `rgba(${value},${value},${value},${Math.random() * strength})`;
    context.fillRect(Math.random() * SIZE, Math.random() * SIZE, 2, 2);
  }
}

function shadeHex(hex: string, factor: number): string {
  const value = parseInt(hex.slice(1), 16);
  const clamp = (channel: number): number => Math.max(0, Math.min(255, Math.round(channel)));
  return `rgb(${clamp(((value >> 16) & 255) * factor)},${clamp(((value >> 8) & 255) * factor)},${clamp((value & 255) * factor)})`;
}

function normalFromHeight(heightCanvas: HTMLCanvasElement): THREE.Texture {
  const sourceContext = heightCanvas.getContext('2d');
  const output = document.createElement('canvas');
  output.width = output.height = SIZE;
  const context = output.getContext('2d');
  if (!sourceContext || !context) throw new Error('2D canvas context unavailable');

  const source = sourceContext.getImageData(0, 0, SIZE, SIZE);
  const destination = context.createImageData(SIZE, SIZE);
  const sample = (x: number, y: number): number =>
    source.data[((((y + SIZE) % SIZE) * SIZE) + ((x + SIZE) % SIZE)) * 4];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) / 255;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) / 255;
      const length = Math.hypot(dx * 2, dy * 2, 1);
      const index = (y * SIZE + x) * 4;
      destination.data[index] = ((-dx * 2 / length) * 0.5 + 0.5) * 255;
      destination.data[index + 1] = ((-dy * 2 / length) * 0.5 + 0.5) * 255;
      destination.data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      destination.data[index + 3] = 255;
    }
  }
  context.putImageData(destination, 0, 0);
  return new THREE.CanvasTexture(output);
}
