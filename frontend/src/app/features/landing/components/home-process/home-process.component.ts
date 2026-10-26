import { ChangeDetectionStrategy, Component } from '@angular/core';

import { RevealDirective } from '../../reveal.directive';

@Component({
  selector: 'app-home-process',
  templateUrl: 'home-process.component.html',
  styleUrls: ['home-process.component.scss'],
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeProcessComponent {}
