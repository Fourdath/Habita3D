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
});
