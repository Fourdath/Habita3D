import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RevealDirective } from '../../reveal.directive';

interface MaterialSwatch {
  name: string;
  use: string;
  image: string;
}

@Component({
  selector: 'app-home-tools',
  templateUrl: 'home-tools.component.html',
  styleUrls: ['home-tools.component.scss'],
  imports: [RouterLink, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeToolsComponent {
  /** Thumbnails derived from the CC0 textures the viewer already uses (see ASSETS.md). */
  readonly swatches: readonly MaterialSwatch[] = [
    { name: 'Roble claro', use: 'Piso · Nórdico', image: 'assets/home/materials/oak_wood_planks.webp' },
    { name: 'Estuco blanco', use: 'Muro · Nórdico', image: 'assets/home/materials/white_stucco.webp' },
    { name: 'Hormigón', use: 'Muro · Industrial', image: 'assets/home/materials/rough_concrete.webp' },
    { name: 'Laminado', use: 'Piso · Industrial', image: 'assets/home/materials/laminate_floor_02.webp' },
    { name: 'Ladrillo', use: 'Fachada · Industrial', image: 'assets/home/materials/brick_wall_003.webp' },
  ];
}
