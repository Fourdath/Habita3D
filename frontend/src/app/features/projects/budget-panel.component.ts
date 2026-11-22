import { Component, computed, input, output } from '@angular/core';
import { money } from '../../core/ep2/ep2-api.service';
import type { ProjectBudget, ProjectRoom } from '../../core/ep2/ep2.types';

@Component({
  selector: 'app-floor-budget',
  styles: `
    .room-budget { border-block-end: 1px solid #dde4d7; margin-block-end: 22px; padding-block-end: 18px; }
    .room-budget .ep2-budget-total { margin-block: 14px 0; }
    .room-budget h3 { font-size: 18px; }
    .budget-breakdown { margin-block-start: 12px; }
    .budget-breakdown summary { color: #245442; cursor: pointer; }
    .budget-breakdown summary:focus-visible { outline: 2px solid #245442; outline-offset: 3px; }
  `,
  template: `
    <section class="ep2-card ep2-budget" aria-labelledby="floor-budget-title" aria-live="polite">
      <div class="ep2-section-head"><div><span class="ep2-eyebrow">COMPRA DE PISOS</span><h2 id="floor-budget-title">Tu presupuesto vigente</h2></div><button type="button" (click)="refresh.emit()" [disabled]="loading()">{{ loading() ? 'Consultando…' : 'Consultar precios guardados' }}</button></div>
      <p class="ep2-hint">Solo cajas de piso. No incluye instalación, adhesivos ni otros insumos. Consultar no inicia una extracción.</p>
      @if (error()) { <p role="alert" class="ep2-error">{{ error() }}</p> }
      @if (selectedRoom(); as room) {
        <section class="room-budget" aria-labelledby="room-budget-title">
          <h3 id="room-budget-title">Presupuesto de {{ room.name }}</h3>
          @if (selectedCost(); as cost) {
            <div class="ep2-budget-total">
              <div><span>Costo del piso elegido</span><strong>{{ money(cost.cost_clp) }}</strong></div>
              <div><span>Cajas necesarias</span><strong>{{ cost.boxes ?? 'Pendiente' }}</strong></div>
              <div><span>Límite de la habitación</span><strong>{{ room.budgetClp === null ? 'Sin límite propio' : money(room.budgetClp) }}</strong></div>
            </div>
            @if (cost.fits_budget === false) {
              <p class="ep2-error">Excede el límite de la habitación en {{ money(cost.budget_excess_clp) }}.</p>
            }
            @if (cost.status === 'uncalculable') {
              <p class="ep2-hint">{{ cost.reasons.includes('missing_coverage') ? 'Falta cobertura comprobada.' : 'Falta precio comprobado.' }}</p>
            }
          } @else {
            <p class="ep2-hint">{{ loading() ? 'Calculando el costo de esta habitación…' : room.publicationKey ? 'Costo pendiente de consultar.' : 'Elige un piso para calcular el costo y las cajas.' }}</p>
            @if (room.budgetClp !== null) { <p class="ep2-hint">Límite de la habitación: {{ money(room.budgetClp) }}.</p> }
          }
        </section>
      }
      @if (budget(); as result) {
        <div class="ep2-budget-total"><div><span>{{ result.total_cost_clp === null ? 'Total pendiente' : 'Total del proyecto' }}</span><strong>{{ money(result.total_cost_clp) }}</strong></div><div><span>Presupuesto disponible</span><strong>{{ money(result.budget_clp) }}</strong></div><div><span>Subtotal calculable</span><strong>{{ money(result.calculable_subtotal_clp) }}</strong></div></div>
        @if (result.total_cost_clp === null) { <p class="ep2-notice">Presupuesto parcial: hay habitaciones sin selección o sin cobertura comprobada. Aún no se puede confirmar si el proyecto cabe en el presupuesto.</p> }
        @if (result.fits_budget === false) { <p class="ep2-error">Exceso del proyecto: {{ money(result.budget_excess_clp) }}.</p> }
        @if (result.fits_budget === true) { <p class="ep2-success">El proyecto está dentro del presupuesto con los últimos precios guardados.</p> }
        <details class="budget-breakdown"><summary>Desglose de todas las habitaciones</summary>
        <div class="ep2-table-scroll"><table><caption>Costo por habitación, calculado por el servidor</caption><thead><tr><th>Habitación</th><th>Área de compra</th><th>Cajas</th><th>Costo</th><th>Estado</th></tr></thead><tbody>
          @for (room of rooms(); track room.id) {
            @let row = result.rooms.find(byRoom(room.id));
            <tr><th scope="row">{{ room.name }}</th><td>{{ row?.required_area_m2 ?? 'Pendiente' }}{{ row?.required_area_m2 ? ' m²' : '' }}</td><td>{{ row?.boxes ?? 'Pendiente' }}</td><td>{{ money(row?.cost_clp ?? null) }}</td><td>
              @if (!room.publicationKey) { Sin piso seleccionado }
              @else if (row?.status === 'uncalculable') { {{ row.reasons.includes('missing_coverage') ? 'Falta cobertura comprobada' : 'Falta precio comprobado' }} }
              @else if (row?.fits_budget === false) { Excede límite: {{ money(row?.budget_excess_clp ?? null) }} }
              @else { Calculado }
              @if (row) { <small>Última comprobación: {{ row.last_check_display }}</small> }
            </td></tr>
          }
        </tbody></table></div></details>
      } @else if (!loading() && !error()) { <p class="ep2-notice">Añade habitaciones para consultar el presupuesto.</p> }
    </section>
  `,
})
export class BudgetPanelComponent {
  readonly budget = input<ProjectBudget | null>(null);
  readonly rooms = input<ProjectRoom[]>([]);
  readonly selectedRoom = input<ProjectRoom | null>(null);
  readonly selectedCost = computed(() => this.budget()?.rooms.find(row => row.room_id === this.selectedRoom()?.id));
  readonly loading = input(false);
  readonly error = input('');
  readonly refresh = output<void>();
  readonly money = money;
  byRoom(id: string) { return (row: ProjectBudget['rooms'][number]) => row.room_id === id; }
}
