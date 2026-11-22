import * as THREE from 'three';
import { InteriorWallColorPreview } from './interior-wall-colors';

describe('interior wall color preview', () => {
  it('paints one room over the house color and leaves the facade and the floor alone', () => {
    const geometry = new THREE.PlaneGeometry();
    const texture = new THREE.Texture();
    const base = new THREE.MeshStandardMaterial({ map: texture, color: 0xffccaa });
    const house = new THREE.Group();
    const living = new THREE.Mesh(geometry, base);
    const kitchen = new THREE.Mesh(geometry, base);
    const exterior = new THREE.Mesh(geometry, base);
    const floor = new THREE.Mesh(geometry, base);
    living.userData = { semanticType: 'wall-finish', environment: 'INTERIOR', roomId: 'living' };
    kitchen.userData = { semanticType: 'wall-finish', environment: 'INTERIOR', roomId: 'kitchen' };
    exterior.userData = { semanticType: 'exterior-finish', environment: 'EXTERIOR', roomId: 'living' };
    floor.userData = { semanticType: 'room-floor', roomId: 'living' };
    house.add(living, kitchen, exterior, floor);

    const preview = new InteriorWallColorPreview();
    const colors = { all: '#336699', rooms: new Map([['living', '#884400']]) };
    preview.apply(house, colors);
    expect(living.material.color.getHexString()).toBe('884400');
    expect(living.material.map).toBe(texture);
    expect(kitchen.material.color.getHexString()).toBe('336699');
    expect(exterior.material).toBe(base);
    expect(floor.material).toBe(base);
    expect(base.color.getHexString()).toBe('ffccaa');

    const oldTint = vi.spyOn(living.material, 'dispose');
    const newStyle = new THREE.MeshPhysicalMaterial({ color: 0xffffff, clearcoat: 0.4 });
    living.material = newStyle;
    preview.apply(house, colors);
    expect(oldTint).toHaveBeenCalledOnce();
    expect(living.material.color.getHexString()).toBe('884400');
    expect(living.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);

    preview.dispose();
    expect(living.material).toBe(newStyle);
    expect(kitchen.material).toBe(base);
    geometry.dispose();
    texture.dispose();
    base.dispose();
    newStyle.dispose();
  });
});
