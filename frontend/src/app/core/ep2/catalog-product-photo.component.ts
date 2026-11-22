import { Component, computed, input, linkedSignal } from '@angular/core';
import { safeCatalogUrl } from './ep2-api.service';

@Component({
  selector: 'app-catalog-product-photo',
  template: `
    @if (url() && !failed()) {
      <img [src]="url()" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="failed.set(true)" />
    } @else {
      <span>Foto no disponible</span>
    }
  `,
  styles: `
    :host { display: grid; width: 100%; height: 100%; place-items: center; overflow: hidden; }
    img { width: 100%; height: 100%; object-fit: contain; }
    span { padding: .25rem; text-align: center; }
  `,
})
export class CatalogProductPhotoComponent {
  readonly src = input<string | null>();
  readonly url = computed(() => safeCatalogUrl(this.src()));
  readonly failed = linkedSignal({ source: this.url, computation: () => false });
}
