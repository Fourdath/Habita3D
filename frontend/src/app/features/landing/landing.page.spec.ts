import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingPage } from './landing.page';

describe('LandingPage', () => {
  let component: LandingPage;
  let fixture: ComponentFixture<LandingPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(LandingPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('keeps the 3D viewer link and explains that the estimate uses demo data', () => {
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('a[href="/viewer-3d"]')).not.toBeNull();
    expect(page.textContent).toContain('no provienen de precios ni disponibilidad de tiendas web');
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

  it('sends the project to the same-origin API and displays the stored project and recommendation', async () => {
    component.previewForm.setValue({
      name: '  Casa de prueba  ',
      areaM2: 80,
      budgetClp: 90000000,
    });
    fixture.detectChanges();
    submitForm();

    const request = http.expectOne('/api/projects/preview');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Casa de prueba', areaM2: 80, budgetClp: 90000000 });
    expect(component.isLoading()).toBe(true);

    request.flush({
      project: { id: 123, name: 'Casa de prueba' },
      recommendation: {
        recommended_tier: 'Estándar',
        estimated_cost_clp: 80000000,
        budget_difference_clp: 10000000,
        fits_budget: true,
        reason: 'Presupuesto suficiente para el nivel estándar.',
        source: 'demo',
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.estimate-result')?.textContent).toContain('123');
    expect(page.querySelector('.estimate-result')?.textContent).toContain('Estándar');
    expect(page.querySelector('.estimate-result')?.textContent).toContain('Dentro del presupuesto');
    expect(page.querySelector('.estimate-result')?.textContent).toContain('no representa una cotización');
    expect(component.isLoading()).toBe(false);
  });

  it('rejects a blank project name before making a request', async () => {
    component.previewForm.controls.name.setValue('   ');
    await component.submitPreview();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('Completa los datos');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    http.expectNone('/api/projects/preview');
  });

  it('reports a temporarily unavailable recommendation service and allows retry', async () => {
    submitForm();
    http.expectOne('/api/projects/preview').flush({}, { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('no está disponible');
    expect(component.preview()).toBeNull();
    expect(component.isLoading()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.estimate-submit')?.disabled).toBe(false);
  });

  function submitForm(): void {
    (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  }
});
