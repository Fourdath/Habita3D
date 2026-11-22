import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CatalogProductPhotoComponent } from '../../core/ep2/catalog-product-photo.component';
import { apiError, chileDate, Ep2ApiService, money } from '../../core/ep2/ep2-api.service';
import type { FloorCategory, FloorSuggestion, FloorSuggestions, ProjectRoom, RetailSource } from '../../core/ep2/ep2.types';
import { SuggestionDismissals } from './suggestion-dismissals.service';

@Component({
  selector: 'app-floor-suggestions',
  imports: [ReactiveFormsModule, CatalogProductPhotoComponent, RouterLink],
  templateUrl: './floor-suggestions.component.html',
  styleUrl: './floor-suggestions.component.scss',
})
export class FloorSuggestionsComponent {
  private readonly api = inject(Ep2ApiService);
  private readonly dismissals = inject(SuggestionDismissals);
  private readonly destroyRef = inject(DestroyRef);
  readonly projectId = input.required<number>();
  readonly room = input.required<ProjectRoom>();
  readonly compact = input(false);
  readonly enabled = input(true);
  readonly busy = input(false);
  readonly canPreview = input(false);
  readonly preferencesSaved = output<ProjectRoom>();
  readonly floorAccepted = output<ProjectRoom>();
  readonly pendingChange = output<boolean>();
  readonly openCatalog = output<void>();
  readonly response = signal<FloorSuggestions | null>(null);
  readonly loading = signal(false);
  readonly working = signal(false);
  readonly queryError = signal('');
  readonly actionError = signal('');
  readonly priceChange = signal<{ previous: FloorSuggestion; current: FloorSuggestion } | null>(null);
  readonly preferences = new FormGroup({
    preferredCategory: new FormControl<FloorCategory | ''>('', { nonNullable: true }),
    preferredSource: new FormControl<RetailSource | ''>('', { nonNullable: true }),
  });
  readonly money = money;
  readonly chileDate = chileDate;
  private request = 0;

  constructor() {
    effect(() => {
      const room = this.room();
      this.projectId();
      this.enabled();
      untracked(() => {
        this.preferences.setValue({
          preferredCategory: room.preferredCategory ?? '',
          preferredSource: room.preferredSource ?? '',
        });
        this.priceChange.set(null);
        this.actionError.set('');
        void this.refresh();
      });
    });
    this.destroyRef.onDestroy(() => ++this.request);
  }

  hasArea(room: ProjectRoom): boolean {
    return room.areaMode === 'area'
      ? Number(room.areaM2) > 0
      : Number(room.lengthM) > 0 && Number(room.widthM) > 0;
  }

  async refresh(): Promise<void> {
    const request = ++this.request;
    const projectId = this.projectId();
    const room = this.room();
    this.response.set(null);
    this.queryError.set('');
    this.loading.set(false);
    if (!this.enabled() || !this.hasArea(room)) return;
    this.loading.set(true);

    try {
      const exclude = this.dismissals.keys(projectId, room.id);
      const result = await this.api.suggestions(projectId, room.id, exclude);
      if (request === this.request) {
        if (!Array.isArray(result?.suggestions)) throw new Error('Invalid suggestions response');
        this.response.set({ ...result, suggestions: result.suggestions.filter(item => !exclude.includes(item.publicationKey)).slice(0, 3) });
      }
    } catch (error) {
      if (request === this.request) {
        this.queryError.set(this.suggestionError(error));
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  dismiss(suggestion: FloorSuggestion): void {
    this.dismissals.dismiss(this.projectId(), this.room().id, suggestion.publicationKey);
    this.actionError.set('');
    void this.refresh();
  }

  async savePreferences(): Promise<void> {
    const { preferredCategory, preferredSource } = this.preferences.getRawValue();
    await this.mutate(async (projectId, roomId) => {
      const room = await this.api.saveFloorPreferences(projectId, roomId, {
        preferredCategory: preferredCategory || null,
        preferredSource: preferredSource || null,
      });
      if (this.isCurrent(projectId, roomId)) this.preferencesSaved.emit(room);
    });
  }

  async accept(suggestion: FloorSuggestion): Promise<void> {
    await this.mutate(async (projectId, roomId) => {
      const result = await this.api.acceptSuggestion(projectId, roomId, suggestion.publicationKey, suggestion.quoteId);
      if (!this.isCurrent(projectId, roomId)) return;
      if (result.status === 'price_changed') {
        this.priceChange.set({ previous: suggestion, current: result.quote });
        return;
      }
      if (result.status !== 'accepted' || result.room?.id !== roomId || result.room.publicationKey !== suggestion.publicationKey) {
        throw new Error('Invalid suggestion acceptance response');
      }
      this.priceChange.set(null);
      this.floorAccepted.emit(result.room);
    });
  }

  private async mutate(action: (projectId: number, roomId: string) => Promise<void>): Promise<void> {
    if (this.working() || this.busy()) return;
    const projectId = this.projectId();
    const roomId = this.room().id;
    this.working.set(true);
    this.pendingChange.emit(true);
    this.actionError.set('');
    try {
      await action(projectId, roomId);
    } catch (error) {
      if (this.isCurrent(projectId, roomId)) this.actionError.set(this.suggestionError(error));
    } finally {
      this.working.set(false);
      if (!this.destroyRef.destroyed) this.pendingChange.emit(false);
    }
  }

  private isCurrent(projectId: number, roomId: string): boolean {
    return !this.destroyRef.destroyed && this.projectId() === projectId && this.room().id === roomId;
  }

  private suggestionError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) return 'Las sugerencias no están disponibles para esta habitación. Puedes usar el catálogo.';
      if (error.status === 409 && error.error?.code === 'suggestions_disabled') return 'Las sugerencias se desactivaron. Vuelve a abrir el proyecto para actualizar su configuración.';
      if (error.status === 409 && error.error?.code === 'publication_unavailable') return 'Este piso dejó de estar disponible para sugerencias. Vuelve a consultar.';
    }
    return apiError(error);
  }
}
