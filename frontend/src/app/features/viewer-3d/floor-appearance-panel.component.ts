import { Component, input, output } from '@angular/core';

import type { SceneRoom } from '../../core/ep2/ep2.types';
import { FLOOR_FINISHES, type FloorFinishId } from './engine/floor-finishes';

@Component({
  selector: 'app-floor-appearance-panel',
  templateUrl: './floor-appearance-panel.component.html',
  styleUrl: './floor-appearance-panel.component.scss',
})
export class FloorAppearancePanelComponent {
  readonly rooms = input.required<readonly SceneRoom[]>();
  readonly selectedRoomId = input.required<string | null>();
  readonly finish = input<FloorFinishId | null>(null);
  readonly tint = input<string | null>(null);
  readonly busy = input(false);

  readonly roomChange = output<string>();
  readonly finishChange = output<FloorFinishId | null>();
  readonly tintChange = output<string | null>();
  readonly appearanceReset = output<void>();

  readonly finishes = FLOOR_FINISHES;
  readonly tints = [
    { label: 'Tono original', color: null },
    { label: 'Arena', color: '#edd9ba' },
    { label: 'Arcilla', color: '#da9b80' },
    { label: 'Piedra', color: '#aab5c2' },
    { label: 'Salvia', color: '#aebf9e' },
  ] as const;

  onRoomChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id !== this.selectedRoomId() && this.rooms().some(room => room.id === id)) this.roomChange.emit(id);
  }

  onColorChange(event: Event): void {
    const color = (event.target as HTMLInputElement).value.toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(color) && color !== this.tint()) this.tintChange.emit(color);
  }
}
