import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Ep2ApiService, money } from '../../core/ep2/ep2-api.service';
import type { Page, Publication } from '../../core/ep2/ep2.types';

@Component({
  selector: 'app-viewer-floor-catalog',
  imports: [FormsModule],
  templateUrl: 'viewer-floor-catalog.component.html',
  styleUrl: 'viewer-floor-catalog.component.scss',
})
export class ViewerFloorCatalogComponent {
  private readonly api = inject(Ep2ApiService);
  readonly roomId = input<string | null>(null);
  readonly currentKey = input<string | null>(null);
  readonly busy = input(false);
  readonly wholeHouseCount = input(0);
  readonly choose = output<Publication>();
  readonly chooseWholeHouse = output<Publication>();

  readonly catalog = signal<Page<Publication> | null>(null);
  readonly loading = signal(false);
  readonly failedPage = signal<number | null>(null);
  readonly pendingKey = linkedSignal({
    source: () => ({ roomId: this.roomId(), currentKey: this.currentKey() }),
    computation: ({ currentKey }) => currentKey,
  });
  readonly products = computed(() => this.catalog()?.items.filter(isSelectable) ?? []);
  readonly pendingProduct = computed(() => this.products().find(item => item.publicationKey === this.pendingKey()));
  readonly pageCount = computed(() => {
    const result = this.catalog();
    return result ? Math.ceil(result.total / result.limit) : 0;
  });
  readonly money = money;

  private choiceEmitted = false;

  onToggle(event: Event): void {
    if ((event.currentTarget as HTMLDetailsElement).open && !this.catalog() && this.failedPage() === null) {
      void this.load(1);
    }
  }

  async load(page: number): Promise<void> {
    if (this.loading() || this.busy()) return;
    this.loading.set(true);
    this.failedPage.set(null);
    try {
      const result = await this.api.catalog({}, page);
      this.catalog.set(result);
      if (!this.pendingProduct()) this.pendingKey.set(null);
    } catch {
      this.failedPage.set(page);
    } finally {
      this.loading.set(false);
    }
  }

  setPending(key: string): void {
    this.pendingKey.set(key || null);
  }

  save(): void {
    const product = this.pendingProduct();
    if (this.busy() || this.loading() || this.failedPage() !== null || this.choiceEmitted || !product || product.publicationKey === this.currentKey()) return;
    this.choiceEmitted = true;
    queueMicrotask(() => { this.choiceEmitted = false; });
    this.choose.emit(product);
  }

  saveWholeHouse(): void {
    const product = this.pendingProduct();
    if (this.busy() || this.loading() || this.failedPage() !== null || this.choiceEmitted || !product || !this.wholeHouseCount()) return;
    this.choiceEmitted = true;
    queueMicrotask(() => { this.choiceEmitted = false; });
    this.chooseWholeHouse.emit(product);
  }
}

function isSelectable(product: Publication): boolean {
  const coverage = Number(product.coveragePerBoxM2);
  return (product.category === 'ceramic' || product.category === 'laminate')
    && product.availability !== 'unavailable' && product.saleUnit === 'box'
    && Number.isSafeInteger(product.pricePerBoxClp) && product.pricePerBoxClp > 0
    && Number.isFinite(coverage) && coverage > 0;
}
