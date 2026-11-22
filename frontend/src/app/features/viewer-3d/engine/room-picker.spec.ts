import * as THREE from 'three';
import { pickVisibleRoom, RoomPicker } from './room-picker';

describe('room picker', () => {
  const bounds = { left: 25, top: 50, width: 200, height: 100 };

  it('selects the visible floor without raycasting a hidden ceiling', () => {
    const house = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(3, 3);
    const floorMaterial = new THREE.MeshBasicMaterial();
    const glassMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25 });
    const floor = new THREE.Mesh(geometry, floorMaterial);
    const ceiling = new THREE.Mesh(geometry, floorMaterial);
    const glass = new THREE.Mesh(geometry, glassMaterial);
    floor.userData = { semanticType: 'room-floor', roomId: 'living' };
    ceiling.position.z = 1;
    glass.position.z = 2;
    house.add(floor, ceiling, glass);
    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 0, 5);

    expect(pickVisibleRoom(house, camera, bounds, 125, 100)).toBeNull();
    ceiling.visible = false;
    expect(pickVisibleRoom(house, camera, bounds, 125, 100)).toBe('living');
    expect(pickVisibleRoom(house, camera, bounds, 24, 100)).toBeNull();

    geometry.dispose();
    floorMaterial.dispose();
    glassMaterial.dispose();
  });

  it('distinguishes a tap from a drag, multi-touch and cancellation', () => {
    const canvas = document.createElement('canvas');
    const pick = vi.fn();
    const picker = new RoomPicker(canvas, pick);
    function send(type: string, pointerId: number, x: number) {
      const event = new Event(type);
      Object.assign(event, { pointerId, button: 0, clientX: x, clientY: 15 });
      canvas.dispatchEvent(event);
    }

    send('pointerdown', 1, 10);
    send('pointerup', 1, 12);
    expect(pick.mock.calls).toEqual([[12, 15]]);
    send('pointerdown', 1, 10);
    send('pointermove', 1, 25);
    send('pointerup', 1, 10);
    send('pointerdown', 1, 10);
    send('pointerdown', 2, 50);
    send('pointerup', 2, 50);
    send('pointerup', 1, 10);
    send('pointerdown', 1, 10);
    send('pointercancel', 1, 10);
    send('pointerup', 1, 10);
    send('pointerdown', 1, 10);
    picker.setEnabled(false);
    picker.setEnabled(true);
    send('pointerup', 1, 10);
    picker.dispose();
    send('pointerdown', 1, 10);
    send('pointerup', 1, 10);
    expect(pick).toHaveBeenCalledOnce();
  });
});
