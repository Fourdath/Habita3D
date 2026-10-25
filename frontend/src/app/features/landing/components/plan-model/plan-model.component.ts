import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, signal } from '@angular/core';

import { prefersReducedMotion } from '../../home-navigation';
import { ModelBoxComponent } from './model-box.component';
import {
  MODEL_DOOR_SWINGS,
  MODEL_FURNITURE,
  MODEL_ROOMS,
  MODEL_RUG,
  MODEL_WALLS,
} from './plan-model.data';

export type PlanModelMode = 'plan' | 'model';

/** Delay before the hero plays its one-time plan → model transition. */
export const PLAN_MODEL_AUTOPLAY_MS = 1100;

@Component({
  selector: 'app-plan-model',
  templateUrl: 'plan-model.component.html',
  styleUrls: ['plan-model.component.scss'],
  imports: [ModelBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanModelComponent implements OnInit, OnDestroy {
  readonly rooms = MODEL_ROOMS;
  readonly walls = MODEL_WALLS;
  readonly doorSwings = MODEL_DOOR_SWINGS;
  readonly rug = MODEL_RUG;
  readonly furniture = MODEL_FURNITURE;

  readonly mode = signal<PlanModelMode>('plan');

  private autoplayTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (prefersReducedMotion()) {
      // Show the finished model straight away instead of animating towards it.
      this.mode.set('model');
      return;
    }
    this.autoplayTimer = setTimeout(() => {
      this.autoplayTimer = null;
      this.mode.set('model');
    }, PLAN_MODEL_AUTOPLAY_MS);
  }

  ngOnDestroy(): void {
    this.clearAutoplay();
  }

  setMode(mode: PlanModelMode): void {
    this.clearAutoplay();
    this.mode.set(mode);
  }

  private clearAutoplay(): void {
    if (this.autoplayTimer !== null) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }
}
