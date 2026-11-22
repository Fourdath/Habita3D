import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingPage } from './landing.page';

describe('LandingPage', () => {

  let fixture: ComponentFixture<LandingPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(LandingPage);

    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('links the viewer and starts a real floor-budget project', () => {
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('a[href="/viewer-3d"]')).not.toBeNull();
    expect(page.querySelector('a[href="/projects?nuevo=1"]')?.textContent).toContain('Crear proyecto de pisos');
  });

  it('renders the brand hero with a single-colour headline and real calls to action', () => {
    const page = fixture.nativeElement as HTMLElement;
    const title = page.querySelector('h1');
    expect(title?.textContent?.trim()).toBe('De un plano a un espacio que puedes recorrer.');
    expect(title?.children.length).toBe(0);

    const hero = page.querySelector('app-home-hero') as HTMLElement;
    const start = Array.from(hero.querySelectorAll('a')).find((a) => a.textContent?.includes('Comenzar mi proyecto'));
    const demo = Array.from(hero.querySelectorAll('a')).find((a) => a.textContent?.includes('Ver demostración'));
    expect(start?.getAttribute('href')).toBe('#comenzar');
    expect(demo?.getAttribute('href')).toBe('/viewer-3d');
  });

  it('only links to sections that exist on the page', () => {
    const page = fixture.nativeElement as HTMLElement;
    const anchors = Array.from(page.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      const id = anchor.getAttribute('href')!.slice(1);
      expect(page.querySelector(`#${id}`), `missing section #${id}`).not.toBeNull();
    }
  });

  it('scrolls to and focuses the start section when "Comenzar mi proyecto" is used', () => {
    const page = fixture.nativeElement as HTMLElement;
    const section = page.querySelector<HTMLElement>('#comenzar')!;
    const scrollIntoView = vi.fn();
    section.scrollIntoView = scrollIntoView;
    document.body.appendChild(page);

    const start = Array.from(page.querySelectorAll('app-home-hero a')).find((a) => a.textContent?.includes('Comenzar'));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    start!.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(section);
    page.remove();
  });

  it('states the current plan compatibility without promising other formats', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('CubiCasa5K');
    expect(text).toContain('Aún no compatibles');
    expect(text).toContain('Precios de demostración');
  });

  it('guides the user to the catalog budget without creating a sample project', () => {
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Sodimac o Easy');
    expect(page.querySelector('form')).toBeNull();
    http.expectNone('/api/projects/preview');
  });
});
