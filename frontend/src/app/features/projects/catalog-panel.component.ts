import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Ep2ApiService, apiError, chileDate, money } from '../../core/ep2/ep2-api.service';
import type { CatalogStatus, Page, PriceHistory, Publication } from '../../core/ep2/ep2.types';
import { decimal, validDecimal } from './room-editor.component';

@Component({ selector: 'app-floor-catalog', imports: [ReactiveFormsModule], templateUrl: 'catalog-panel.component.html' })
export class CatalogPanelComponent implements OnInit {
  private readonly api = inject(Ep2ApiService);
  readonly roomName = input('');
  readonly selectedKey = input<string | null>(null);
  readonly busy = input(false);
  readonly choose = output<Publication>();
  readonly catalog = signal<Page<Publication>>({ items: [], total: 0, page: 1, limit: 12 });
  readonly status = signal<CatalogStatus | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly statusError = signal('');
  readonly history = signal<PriceHistory | null>(null);
  readonly historyProduct = signal<Publication | null>(null);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');
  readonly failedImages = signal(new Set<string>());
  readonly filters = new FormGroup({ source: new FormControl('', { nonNullable: true }), category: new FormControl('', { nonNullable: true }), minPricePerM2: new FormControl('', { nonNullable: true }), maxPricePerM2: new FormControl('', { nonNullable: true }) });
  private appliedFilters: Record<string, string> = {};
  private historyRequest = 0;
  readonly money = money;
  readonly chileDate = chileDate;

  ngOnInit(): void { void this.refresh(); }
  async refresh(): Promise<void> { await Promise.allSettled([this.loadPage(1), this.loadStatus()]); }
  async applyFilters(): Promise<void> {
    const raw = this.filters.getRawValue();
    const min = decimal(raw.minPricePerM2), max = decimal(raw.maxPricePerM2);
    const price = (value: string) => /^\d{1,16}(\.\d{1,2})?$/.test(value) && validDecimal(value, 1e16, true);
    if ((min && !price(min)) || (max && !price(max)) || (min && max && Number(min) > Number(max))) {
      this.error.set('Revisa el rango de precio por m²: el mínimo no puede superar al máximo.'); return;
    }
    this.appliedFilters = Object.fromEntries(Object.entries({ ...raw, minPricePerM2: min, maxPricePerM2: max }).filter(([, value]) => value !== ''));
    await this.loadPage(1);
  }
  async loadPage(page: number): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    try { this.catalog.set(await this.api.catalog(this.appliedFilters, page)); }
    catch (error) { this.error.set(apiError(error)); }
    finally { this.loading.set(false); }
  }
  async loadStatus(): Promise<void> {
    this.statusError.set('');
    try { this.status.set(await this.api.status()); }
    catch { this.statusError.set('No se pudo comprobar el estado de actualización. Las fechas de cada producto corresponden a su última comprobación guardada.'); }
  }
  updateFailed(): boolean {
    const status = this.status();
    return status?.latestJob?.status === 'failed' || status?.latestRun?.status === 'failed' || status?.latestRun?.status === 'partial'
      || !!status?.groups.some(group => ['failed', 'partial'].includes(group.status));
  }
  async showHistory(product: Publication, page = 1): Promise<void> {
    const request = ++this.historyRequest;
    this.historyProduct.set(product); this.history.set(null); this.historyError.set(''); this.historyLoading.set(true);
    try { const result = await this.api.history(product.publicationKey, page); if (request === this.historyRequest) this.history.set(result); }
    catch (error) { if (request === this.historyRequest) this.historyError.set(apiError(error)); }
    finally { if (request === this.historyRequest) this.historyLoading.set(false); }
  }
  closeHistory(): void { ++this.historyRequest; this.historyProduct.set(null); this.history.set(null); this.historyLoading.set(false); }
  imageFailed(key: string): void { this.failedImages.update(keys => new Set([...keys, key])); }
  safeUrl(value: string | null): string | null {
    try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
  }
  availability(value: string): string { return value === 'available' ? 'Disponible según la fuente' : value === 'unavailable' ? 'No disponible según la fuente' : 'Disponibilidad desconocida'; }
}
