import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Habita3D logotype: a plan cell with a door swing, followed by the wordmark. */
@Component({
  selector: 'app-brand-mark',
  template: `
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="24" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="2.4" />
      <path d="M14 2v9M2 16h7" fill="none" stroke="currentColor" stroke-width="2.4" />
      <path d="M14 26v-9a9 9 0 0 1 9-9" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.55" />
    </svg>
    <span>Habita3D</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: inherit;
      font-family: var(--h3d-font-display);
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {}
