import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Fades an element in the first time it enters the viewport.
 * Content stays visible by default: the hidden state is only applied once an
 * IntersectionObserver exists, so tests (jsdom) and old browsers render everything.
 * Motion is reduced to a short opacity fade by the global `.h3d-reveal` styles.
 */
@Directive({
  selector: '[appReveal]',
})
export class RevealDirective implements OnInit, OnDestroy {
  readonly revealDelay = input(0, { alias: 'appReveal', transform: toDelay });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const element = this.host.nativeElement;
    element.classList.add('h3d-reveal');
    element.style.setProperty('--h3d-reveal-delay', `${this.revealDelay()}ms`);

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.add('is-revealed');
          this.observer?.disconnect();
          this.observer = null;
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

function toDelay(value: number | string | undefined): number {
  const delay = Number(value);
  return Number.isFinite(delay) ? delay : 0;
}
