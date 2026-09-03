import { Component, computed, input, output, signal } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

import { formatClp, type BudgetSummary } from '../../core/interior-style/budget-calculator';
import { listInteriorStyles } from '../../core/interior-style/interior-style-catalog';
import type { InteriorStyleId } from '../../core/interior-style/interior-style.types';

/**
 * Compact style + budget panel for /viewer-3d. Presentational only — Viewer3DPage
 * owns all state and calls into Viewer3DEngine; this component just renders it and
 * emits the user's chosen style.
 *
 * Pointer-lock friendliness: the panel only makes sense to interact with while the
 * pointer is unlocked (there's no visible cursor to click it with while locked, same
 * as the SVG file picker), so it never calls requestPointerLock() itself — clicks are
 * also stopped from bubbling so they can never reach the "click to start" overlay
 * behind it, and key events are stopped from bubbling so using arrow keys/Space to
 * pick a radio option here can never also register as WASD/jump in the 3D view.
 */
@Component({
  selector: 'app-interior-style-panel',
  templateUrl: 'interior-style-panel.component.html',
  styleUrls: ['interior-style-panel.component.scss'],
  imports: [IonSpinner],
})
export class InteriorStylePanelComponent {
  readonly styleId = input.required<InteriorStyleId>();
  readonly loading = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly budget = input.required<BudgetSummary>();
  readonly styleChange = output<InteriorStyleId>();

  readonly styles = listInteriorStyles();
  readonly showBudget = signal(false);
  readonly formattedTotal = computed(() => formatClp(this.budget().totalClp));

  readonly formatClp = formatClp;

  onSelectStyle(id: InteriorStyleId): void {
    if (id !== this.styleId()) {
      this.styleChange.emit(id);
    }
  }

  toggleBudget(): void {
    this.showBudget.update((value) => !value);
  }
}
