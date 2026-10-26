import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ModelBox } from './plan-model.data';

/**
 * One furniture piece of the hero illustration. The host element is the box
 * itself (it keeps `transform-style: preserve-3d`), with only the faces the
 * fixed camera can see: top, south and west. Reads `--m` from the scene.
 */
@Component({
  selector: 'app-model-box',
  template: '<i class="f-s"></i><i class="f-w"></i><i class="f-top"></i>',
  styleUrls: ['model-box.component.scss'],
  host: {
    '[class]': "'t-' + box().tone",
    '[style.--x]': 'box().x',
    '[style.--y]': 'box().y',
    '[style.--w]': 'box().width',
    '[style.--d]': 'box().depth',
    '[style.--h]': 'box().height',
    '[style.--i]': 'index()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelBoxComponent {
  readonly box = input.required<ModelBox>();
  readonly index = input(0);
}
