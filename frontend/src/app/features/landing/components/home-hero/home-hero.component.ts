import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { scrollToHomeSection } from '../../home-navigation';
import { PlanModelComponent } from '../plan-model/plan-model.component';

@Component({
  selector: 'app-home-hero',
  templateUrl: 'home-hero.component.html',
  styleUrls: ['home-hero.component.scss'],
  imports: [RouterLink, PlanModelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHeroComponent {
  startProject(event: Event): void {
    scrollToHomeSection('comenzar', event);
  }
}
