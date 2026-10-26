import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HOME_NAV_ITEMS } from '../../home-navigation';
import { HomeHeaderComponent } from './home-header.component';

describe('HomeHeaderComponent', () => {
  let fixture: ComponentFixture<HomeHeaderComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(HomeHeaderComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('links every home section and the 3D viewer', () => {
    const navLinks = Array.from(element.querySelectorAll('.nav a')).map((a) => a.getAttribute('href'));
    for (const item of HOME_NAV_ITEMS) {
      expect(navLinks).toContain(`#${item.id}`);
    }
    expect(element.querySelector('.cta')?.getAttribute('href')).toBe('/viewer-3d');
  });

  it('toggles the mobile menu and closes it with Escape', () => {
    const menu = element.querySelector<HTMLButtonElement>('.menu')!;
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.nav')?.classList.contains('is-open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });
});
