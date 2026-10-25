import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RevealDirective } from '../../reveal.directive';

interface MaterialSwatch {
  name: string;
  use: string;
  image: string;
}

interface SampleBudgetLine {
  label: string;
  quantity: string;
  subtotal: string;
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

  /**
   * Illustrative lines for a 70 m² house with the Nordic style, using the demo unit
   * prices from interior-style-catalog.ts (quantities include 10 % waste).
   * Not a quote — the viewer computes real quantities from the loaded plan.
   */
  readonly sampleBudget: readonly SampleBudgetLine[] = [
    { label: 'Piso de roble claro', quantity: '77,0 m²', subtotal: '$1.455.300' },
    { label: 'Terminación interior', quantity: '105,6 m²', subtotal: '$728.640' },
    { label: 'Estuco exterior', quantity: '56,1 m²', subtotal: '$723.690' },
    { label: 'Cielo blanco', quantity: '77,0 m²', subtotal: '$454.300' },
  ];

  readonly sampleTotal = '$3.361.930';
}
