import * as THREE from 'three';

const TAP_DISTANCE_PX = 6;

export class RoomPicker {
  private enabled = true;
  private readonly pointers = new Set<number>();
  private start: { id: number; x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLElement, private readonly pick: (x: number, y: number) => void) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onCancel);
    canvas.addEventListener('lostpointercapture', this.onCancel);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pointers.clear();
      this.start = null;
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('pointerleave', this.onCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onCancel);
    this.setEnabled(false);
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointers.add(event.pointerId);
    this.start = event.button === 0 && this.pointers.size === 1
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (this.start?.id === event.pointerId && this.moved(event)) this.start = null;
  };

  private readonly onUp = (event: PointerEvent): void => {
    const shouldPick = event.button === 0 && this.start?.id === event.pointerId && !this.moved(event);
    this.onCancel(event);
    if (shouldPick) this.pick(event.clientX, event.clientY);
  };

  private readonly onCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.start?.id === event.pointerId) this.start = null;
  };

  private moved(event: PointerEvent): boolean {
    return this.start !== null && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > TAP_DISTANCE_PX;
  }
}

export function pickVisibleRoom(
  house: THREE.Group | null,
  camera: THREE.Camera,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  x: number,
  y: number,
): string | null {
  if (!house || bounds.width <= 0 || bounds.height <= 0) return null;
  const screenX = (x - bounds.left) / bounds.width;
  const screenY = (y - bounds.top) / bounds.height;
  if (screenX < 0 || screenX > 1 || screenY < 0 || screenY > 1) return null;

  house.updateWorldMatrix(true, true);
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(screenX * 2 - 1, 1 - screenY * 2), camera);
  const surfaces: THREE.Mesh[] = [];
  house.traverseVisible(object => { if (object instanceof THREE.Mesh) surfaces.push(object); });

  for (const hit of ray.intersectObjects(surfaces, false)) {
    if (!(hit.object instanceof THREE.Mesh)) continue;
    const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
    if (!material?.visible || (material.transparent && material.opacity < 0.5)) continue;
    const roomId = hit.object.userData['roomId'];
    return hit.object.userData['semanticType'] === 'room-floor' && typeof roomId === 'string' ? roomId : null;
  }
  return null;
}
