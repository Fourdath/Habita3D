import { Component, input, output } from '@angular/core';
import { money } from '../../core/ep2/ep2-api.service';
import type { ProjectBudget, ProjectRoom } from '../../core/ep2/ep2.types';

@Component({
  selector: 'app-floor-budget',
  template: `
    <section class="ep2-card ep2-budget" aria-labelledby="floor-budget-title" aria-live="polite">
      <div class="ep2-section-head"><div><span class="ep2-eyebrow">COMPRA DE PISOS</span><h2 id="floor-budget-title">Tu presupuesto vigente</h2></div><button type="button" (click)="refresh.emit()" [disabled]="loading()">{{ loading() ? 'Consultando…' : 'Consultar precios guardados' }}</button></div>
      <p class="ep2-hint">Solo cajas de piso. No incluye instalación, adhesivos ni otros insumos. Consultar no inicia una extracción.</p>
      @if (error()) { <p role="alert" class="ep2-error">{{ error() }}</p> }
      @if (budget(); as result) {
        <div class="ep2-budget-total"><div><span>{{ result.total_cost_clp === null ? 'Total pendiente' : 'Total del proyecto' }}</span><strong>{{ money(result.total_cost_clp) }}</strong></div><div><span>Presupuesto disponible</span><strong>{{ money(result.budget_clp) }}</strong></div><div><span>Subtotal calculable</span><strong>{{ money(result.calculable_subtotal_clp) }}</strong></div></div>
        @if (result.total_cost_clp === null) { <p class="ep2-notice">Presupuesto parcial: hay habitaciones sin selección o sin cobertura comprobada. Aún no se puede confirmar si el proyecto cabe en el presupuesto.</p> }
        @if (result.fits_budget === false) { <p class="ep2-error">Exceso del proyecto: {{ money(result.budget_excess_clp) }}.</p> }
        @if (result.fits_budget === true) { <p class="ep2-success">El proyecto está dentro del presupuesto con los últimos precios guardados.</p> }
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
        </tbody></table></div>
      } @else if (!loading() && !error()) { <p class="ep2-notice">Añade habitaciones para consultar el presupuesto.</p> }
    </section>
  `,
})
export class BudgetPanelComponent {
  readonly budget = input<ProjectBudget | null>(null);
  readonly rooms = input<ProjectRoom[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  readonly refresh = output<void>();
  readonly money = money;
  byRoom(id: string) { return (row: ProjectBudget['rooms'][number]) => row.room_id === id; }
}
