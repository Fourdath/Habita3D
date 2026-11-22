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
    const groutPx = Math.max(2, Math.round(Math.min(cellWidth, cellHeight) * 0.015));
    const faceWidth = cellWidth - groutPx * 2;
    const faceHeight = cellHeight - groutPx * 2;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = column * cellWidth + groutPx;
        const y = row * cellHeight + groutPx;
        const seed = row * columns + column + 1;
        const random = tileRandom(seed);
        albedo.fillStyle = shadeHex(spec.color, 1 + (random() - 0.5) * (spec.pattern === 'wood' ? 0.13 : 0.07));
        albedo.fillRect(x, y, faceWidth, faceHeight);
        if (spec.pattern) drawTilePattern(albedo, spec.pattern, x, y, faceWidth, faceHeight, random);
        height.fillStyle = '#c8c8c8';
        height.fillRect(x, y, faceWidth, faceHeight);
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

function tileRandom(seed: number): () => number {
  let state = Math.imul(seed, 0x9e3779b1);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function drawTilePattern(
  context: CanvasRenderingContext2D,
  pattern: 'marble' | 'wood',
  x: number,
  y: number,
  width: number,
  height: number,
  random: () => number,
): void {
  context.save();
  context.translate(x, y);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  if (pattern === 'wood') drawWoodGrain(context, width, height, random);
  else drawMarbleVeins(context, width, height, random);
  context.restore();
}

function drawWoodGrain(context: CanvasRenderingContext2D, width: number, height: number, random: () => number): void {
  for (let strand = 0; strand < 42; strand++) {
    const x = random() * width;
    const drift = width * (random() - 0.5) * 0.19;
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x + drift, height * 0.3, x - drift, height * 0.72, x + drift * 0.6, height);
    context.lineWidth = 0.65 + random() * 2.2;
    context.strokeStyle = strand % 4 === 0 ? 'rgba(255,244,220,.18)' : `rgba(61,38,23,${0.03 + random() * 0.18})`;
    context.stroke();
  }
}

function drawMarbleVeins(context: CanvasRenderingContext2D, width: number, height: number, random: () => number): void {
  for (let vein = 0; vein < 7; vein++) {
    const start = height * (random() * 1.6 - 0.65);
    const drop = height * (0.36 + random() * 0.46);
    context.beginPath();
    context.moveTo(-8, start);
    context.bezierCurveTo(width * 0.34, start + drop * 0.46, width * 0.42, start + drop * 0.13, width + 8, start + drop);
    context.lineWidth = 5 + random() * 13;
    context.strokeStyle = 'rgba(119,112,112,.075)';
    context.stroke();
    context.lineWidth = 0.8 + random() * 2.4;
    context.strokeStyle = `rgba(124,115,118,${0.13 + random() * 0.23})`;
    context.stroke();
  }
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
