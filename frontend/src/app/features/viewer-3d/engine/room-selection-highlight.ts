import * as THREE from 'three';

/** A separate overlay keeps the room's own texture and the pick/collision meshes intact. */
export class RoomSelectionHighlight {
  private readonly group = new THREE.Group();
  private readonly fill = new THREE.MeshBasicMaterial({
    color: 0x4e8c6b, transparent: true, opacity: 0.17, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  private readonly border = new THREE.LineBasicMaterial({ color: 0x296c4c, depthWrite: false, toneMapped: false });
  private edges: THREE.EdgesGeometry | null = null;

  constructor(scene: THREE.Scene) {
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
  }

  show(house: THREE.Group | null, roomId: string | null): void {
    this.clear();
    if (!house || !roomId) return;
    const floor = house.getObjectByName(`room-floor-${roomId}`);
    if (!(floor instanceof THREE.Mesh)) return;

    floor.updateWorldMatrix(true, false);
    this.group.matrix.copy(floor.matrixWorld);
    this.group.matrix.elements[13] += 0.006;
    this.group.matrixWorldNeedsUpdate = true;
    this.edges = new THREE.EdgesGeometry(floor.geometry);
    this.group.add(new THREE.Mesh(floor.geometry, this.fill), new THREE.LineSegments(this.edges, this.border));
  }

  dispose(): void {
    this.clear();
    this.fill.dispose();
    this.border.dispose();
    this.group.removeFromParent();
  }

  private clear(): void {
    this.group.clear();
    this.edges?.dispose();
    this.edges = null;
  }
}
