import * as THREE from 'three';

import { sheetProductForFace, type SheetProductId } from '../../../core/budget/board-coverage';
import { CONSTRUCTION_PRODUCT_CATALOG } from '../../../core/budget/construction-product.catalog';
import type { ManifestWallFace } from '../../../core/budget/surface-manifest.types';

export const CONSTRUCTION_VIEW_LEGEND = [
  { productId: 'GYPSUM_BOARD_ST_12_5', label: 'Yeso-cartón ST', color: '#edc87f', description: 'Cara interior de muros livianos en recintos secos.' },
  { productId: 'GYPSUM_BOARD_RH_12_5', label: 'Yeso-cartón RH', color: '#78c7ae', description: 'Cara de los muros livianos que da al baño.' },
  { productId: 'EXTERIOR_FIBERCEMENT_BOARD', label: 'Fibrocemento', color: '#91b8dd', description: 'Cara expuesta al exterior de las fachadas livianas.' },
] as const satisfies readonly { productId: SheetProductId; label: string; color: string; description: string }[];

type FaceClassification = Pick<ManifestWallFace, 'assemblyId' | 'environment' | 'roomSemantic'>;

/** Paints the built wall faces with their estimated board type and nominal stock grid. */
export class ConstructionBoardView {
  private house: THREE.Group | null = null;
  private readonly overlays: THREE.Mesh[] = [];
  private readonly materials = new Map<SheetProductId, THREE.MeshBasicMaterial>();

  setEnabled(enabled: boolean, house: THREE.Group | null): void {
    const target = enabled ? house : null;
    if (target === this.house) return;
    this.clear();
    this.house = target;
    if (!target) return;

    const faces: Array<{ mesh: THREE.Mesh; productId: SheetProductId }> = [];
    target.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const kind = object.userData['semanticType'];
      if (kind !== 'wall-finish' && kind !== 'exterior-finish') return;
      const productId = sheetProductForFace(object.userData as FaceClassification);
      if (productId) faces.push({ mesh: object, productId });
    });

    for (const { mesh, productId } of faces) {
      const overlay = new THREE.Mesh(mesh.geometry, this.materialFor(productId));
      overlay.name = `construction-board-${productId}`;
      overlay.raycast = () => undefined;
      // The wall owns its geometry. The small offset clears the visible finish.
      const normals = mesh.geometry.getAttribute('normal');
      if (normals?.count) overlay.position.fromBufferAttribute(normals, 0).multiplyScalar(.002);
      mesh.add(overlay);
      this.overlays.push(overlay);
    }
  }

  dispose(): void {
    this.clear();
    for (const material of this.materials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.materials.clear();
  }

  private clear(): void {
    for (const overlay of this.overlays) overlay.removeFromParent();
    this.overlays.length = 0;
    this.house = null;
  }

  private materialFor(productId: SheetProductId): THREE.MeshBasicMaterial {
    const existing = this.materials.get(productId);
    if (existing) return existing;
    const product = CONSTRUCTION_PRODUCT_CATALOG[productId];
    const color = CONSTRUCTION_VIEW_LEGEND.find(item => item.productId === productId)!.color;
    const map = createBoardGrid(color, product.widthMeters ?? 1.2, product.heightMeters ?? 2.4);
    const material = new THREE.MeshBasicMaterial({
      map, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.materials.set(productId, material);
    return material;
  }
}

function createBoardGrid(color: string, widthM: number, heightM: number): THREE.DataTexture {
  const width = 64;
  const height = 128;
  const pixels = new Uint8Array(width * height * 4);
  const hex = Number.parseInt(color.slice(1), 16);
  const channels = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const seam = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      for (let channel = 0; channel < channels.length; channel++) {
        pixels[index + channel] = Math.round(channels[channel] * (seam ? .55 : 1));
      }
      pixels[index + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / widthM, 1 / heightM);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}
