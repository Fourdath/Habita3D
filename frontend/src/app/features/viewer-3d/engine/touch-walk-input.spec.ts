import { PerspectiveCamera } from 'three';
import { TouchWalkInput } from './touch-walk-input';

describe('TouchWalkInput', () => {
  let canvas: HTMLCanvasElement;
  let camera: PerspectiveCamera;
  let input: TouchWalkInput;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    camera = new PerspectiveCamera();
    input = new TouchWalkInput(canvas, camera);
  });

  afterEach(() => input.dispose());

  function pointer(type: string, id: number, x: number, y: number, pointerType = 'touch'): void {
    const event = new Event(type);
    Object.assign(event, { pointerId: id, clientX: x, clientY: y, pointerType });
    canvas.dispatchEvent(event);
  }

  it('keeps drag-to-look isolated from the overview and clamps pitch', () => {
    pointer('pointerdown', 1, 0, 0);
    pointer('pointermove', 1, 20, -1000);
    expect(camera.rotation.x).toBe(0);
    input.setEnabled(true);
    pointer('pointerdown', 2, 0, 0, 'mouse');
    pointer('pointermove', 2, 20, -1000, 'mouse');
    expect(camera.rotation.x).toBe(0);
    pointer('pointerdown', 1, 0, 0);
    pointer('pointermove', 1, 20, -1000);
    expect(camera.rotation.y).toBeCloseTo(-.12);
    expect(camera.rotation.x).toBeCloseTo(Math.PI / 2 - .01);
    pointer('pointercancel', 1, 20, -1000);
    pointer('pointermove', 1, 30, 0);
    expect(camera.rotation.y).toBeCloseTo(-.12);
  });

  it('clears held directions on blur or when leaving the walkthrough', () => {
    input.setDirection('forward', true);
    expect(input.getState().forward).toBe(false);
    input.setEnabled(true);
    input.setDirection('forward', true);
    input.setDirection('left', true);
    expect(input.getState()).toMatchObject({ forward: true, left: true });
    window.dispatchEvent(new Event('blur'));
    expect(input.getState()).toMatchObject({ forward: false, left: false });
    input.setDirection('right', true);
    input.setEnabled(false);
    expect(input.getState().right).toBe(false);
  });
});
