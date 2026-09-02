import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Viewer3DPage } from './viewer-3d.page';

describe('Viewer3DPage', () => {
  let component: Viewer3DPage;
  let fixture: ComponentFixture<Viewer3DPage>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Viewer3DPage);
    component = fixture.componentInstance;
    // jsdom has no WebGL context, so the engine construction below throws and the
    // page falls back to its 'error' status instead of crashing the test.
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('falls back to the error state when the 3D engine cannot start', () => {
    expect(component.status()).toBe('error');
  });

  function fileInputEvent(file: File): Event {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    return { target: input } as unknown as Event;
  }

  it('reports a clear message and keeps the viewer state when the picked file is invalid', async () => {
    const badFile = new File(['not an svg'], 'plan.png', { type: 'image/png' });

    await component.onFloorplanFileSelected(fileInputEvent(badFile));

    expect(component.floorplanError()).toContain('.svg');
    expect(component.loadingFloorplan()).toBe(false);
  });

  it('clears any previous error once a structurally valid file is picked', async () => {
    const validFile = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><g class="Wall"><polygon points="0,0 10,0 10,2 0,2"/></g></svg>'],
      'plan.svg',
      { type: 'image/svg+xml' },
    );

    await component.onFloorplanFileSelected(fileInputEvent(validFile));

    expect(component.floorplanError()).toBeNull();
  });
});
