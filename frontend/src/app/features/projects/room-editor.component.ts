import { Component, OnChanges, SimpleChanges, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ProjectRoom, RoomInput, SceneRoom } from '../../core/ep2/ep2.types';

export function decimal(value: string): string { return value.trim().replace(',', '.'); }
export function validDecimal(value: string, max: number, allowZero = false): boolean {
  const normalized = decimal(value);
  return /^\d+(\.\d{1,6})?$/.test(normalized) && Number(normalized) <= max && (allowZero ? Number(normalized) >= 0 : Number(normalized) > 0);
}

@Component({
  selector: 'app-room-editor', imports: [ReactiveFormsModule],
  templateUrl: 'room-editor.component.html',
})
export class RoomEditorComponent implements OnChanges {
  readonly room = input<ProjectRoom | null>(null);
  readonly sceneRooms = input<SceneRoom[]>([]);
  readonly busy = input(false);
  readonly save = output<RoomInput>();
  readonly cancelEdit = output<void>();
  error = '';
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    areaMode: new FormControl<'area' | 'dimensions'>('area', { nonNullable: true }),
    areaM2: new FormControl('', { nonNullable: true }),
    lengthM: new FormControl('', { nonNullable: true }), widthM: new FormControl('', { nonNullable: true }),
    wastePercent: new FormControl('10', { nonNullable: true }),
    budgetClp: new FormControl('', { nonNullable: true }), sceneRoomId: new FormControl('', { nonNullable: true }),
  });
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['room']) return;
    const room = this.room();
    if (room) this.form.setValue({ name: room.name, areaMode: room.areaMode, areaM2: room.areaM2 ?? '', lengthM: room.lengthM ?? '', widthM: room.widthM ?? '', wastePercent: room.wastePercent, budgetClp: room.budgetClp?.toString() ?? '', sceneRoomId: room.sceneRoomId ?? '' });
    else this.form.reset({ name: '', areaMode: 'area', areaM2: '', lengthM: '', widthM: '', wastePercent: '10', budgetClp: '', sceneRoomId: '' });
    this.error = '';
  }
  useScene(): void {
    const scene = this.sceneRooms().find(room => room.id === this.form.controls.sceneRoomId.value);
    if (scene && !this.room()) this.form.patchValue({ name: scene.name, areaMode: 'area', areaM2: scene.areaM2.toFixed(6) });
  }
  submit(): void {
    const data = this.form.getRawValue();
    const validArea = data.areaMode === 'area' ? validDecimal(data.areaM2, 1_000_000) : validDecimal(data.lengthM, 10_000) && validDecimal(data.widthM, 10_000);
    if (this.form.invalid || !data.name.trim() || !validArea || !validDecimal(data.wastePercent, 100, true)
      || (data.budgetClp !== '' && (!/^\d+$/.test(data.budgetClp) || Number(data.budgetClp) > 1e15))) {
      this.error = 'Revisa el nombre, la superficie positiva, el margen entre 0 y 100 % y el límite en pesos enteros.';
      return;
    }
    this.error = '';
    this.save.emit({ name: data.name.trim(), areaMode: data.areaMode,
      ...(data.areaMode === 'area' ? { areaM2: decimal(data.areaM2) } : { lengthM: decimal(data.lengthM), widthM: decimal(data.widthM) }),
      wastePercent: decimal(data.wastePercent), budgetClp: data.budgetClp === '' ? null : Number(data.budgetClp), sceneRoomId: data.sceneRoomId || null });
  }
}
