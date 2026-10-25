import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PLAN_MODEL_AUTOPLAY_MS, PlanModelComponent } from './plan-model.component';
import { MODEL_FURNITURE, MODEL_WALLS } from './plan-model.data';

describe('PlanModelComponent', () => {
  let fixture: ComponentFixture<PlanModelComponent>;
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia as typeof window.matchMedia;
  });

  function create(): HTMLElement {
    fixture = TestBed.createComponent(PlanModelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function mockReducedMotion(reduce: boolean): void {
    window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
  }

  it('renders every wall and furniture piece of the illustration', () => {
    const element = create();
    expect(element.querySelectorAll('.wall').length).toBe(MODEL_WALLS.length);
    expect(element.querySelectorAll('app-model-box').length).toBe(MODEL_FURNITURE.length);
    expect(element.querySelectorAll('app-model-box i').length).toBe(MODEL_FURNITURE.length * 3);
  });

  it('starts as a plan and plays the transition to the 3D model once', () => {
    mockReducedMotion(false);
    const element = create();
    expect(element.querySelector('.stage')?.classList.contains('is-model')).toBe(false);

    vi.advanceTimersByTime(PLAN_MODEL_AUTOPLAY_MS);
    fixture.detectChanges();

    expect(element.querySelector('.stage')?.classList.contains('is-model')).toBe(true);
  });

  it('shows the finished model immediately when reduced motion is requested', () => {
    mockReducedMotion(true);
    const element = create();
    expect(element.querySelector('.stage')?.classList.contains('is-model')).toBe(true);
  });

  it('lets the visitor switch between plan and model with pressed-state buttons', () => {
    mockReducedMotion(false);
    const element = create();
    const [planButton, modelButton] = Array.from(element.querySelectorAll<HTMLButtonElement>('.h3d-segmented button'));

    modelButton.click();
    fixture.detectChanges();
    expect(modelButton.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.stage')?.classList.contains('is-model')).toBe(true);

    planButton.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(PLAN_MODEL_AUTOPLAY_MS * 2);
    fixture.detectChanges();
    // A manual choice cancels the autoplay, so the plan stays visible.
    expect(planButton.getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.stage')?.classList.contains('is-model')).toBe(false);
  });
});
