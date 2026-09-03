import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { IonContent, IonSpinner } from '@ionic/angular';

import { computeBudget, type BudgetSummary } from '../../core/interior-style/budget-calculator';
import type { InteriorStyleId } from '../../core/interior-style/interior-style.types';
import { readFloorplanFile } from '../../core/floorplan/floorplan-file';

import { Viewer3DEngine } from './engine/viewer-3d-engine';
import type { ViewerStatus } from './engine/viewer-3d.types';
import { InteriorStylePanelComponent } from './interior-style-panel.component';

@Component({
  selector: 'app-viewer-3d',
  templateUrl: 'viewer-3d.page.html',
  styleUrls: ['viewer-3d.page.scss'],
  imports: [IonContent, IonSpinner, InteriorStylePanelComponent],
})
export class Viewer3DPage implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost', { static: true })
  private readonly canvasHostRef!: ElementRef<HTMLDivElement>;

  readonly status = signal<ViewerStatus>('loading');
  readonly pointerLocked = signal(false);
  readonly errorMessage = signal('');

  readonly loadingFloorplan = signal(false);
  readonly floorplanError = signal<string | null>(null);

  readonly interiorStyleId = signal<InteriorStyleId>('none');
  readonly interiorStyleLoading = signal(false);
  readonly interiorStyleError = signal<string | null>(null);
  readonly furnitureAvailable = signal(true);
  readonly budget = signal<BudgetSummary>(computeBudget('none'));

  private engine: Viewer3DEngine | null = null;

  ngAfterViewInit(): void {
    try {
      this.engine = new Viewer3DEngine(this.canvasHostRef.nativeElement, {
        onReady: () => {
          this.status.set('ready');
          this.refreshStyleState();
        },
        onError: (error) => this.handleError(error),
        onPointerLockChange: (locked) => this.pointerLocked.set(locked),
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
    this.engine = null;
  }

  onStartClick(): void {
    this.engine?.requestPointerLock();
  }

  /**
   * Reads and validates the picked SVG entirely in memory (never uploaded, never
   * written into public/) and hands it to the engine. On any failure — bad
   * extension/size/XML, or a structurally invalid plan — the current house stays
   * exactly as it was; only floorplanError() is set, so the 3D view is unaffected.
   */
  async onFloorplanFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }

    this.loadingFloorplan.set(true);
    try {
      const svgText = await readFloorplanFile(file);
      await this.engine?.loadFloorplanFromSvgText(svgText);
      this.floorplanError.set(null);
      this.refreshStyleState();
    } catch (error) {
      this.floorplanError.set(error instanceof Error ? error.message : 'No se pudo cargar el plano seleccionado.');
    } finally {
      this.loadingFloorplan.set(false);
    }
  }

  async onInteriorStyleChange(styleId: InteriorStyleId): Promise<void> {
    this.interiorStyleLoading.set(true);
    try {
      await this.engine?.applyInteriorStyle(styleId);
      this.interiorStyleId.set(styleId);
      this.interiorStyleError.set(null);
      this.refreshStyleState();
    } catch (error) {
      this.interiorStyleError.set(error instanceof Error ? error.message : 'No se pudo aplicar el estilo seleccionado.');
    } finally {
      this.interiorStyleLoading.set(false);
    }
  }

  private refreshStyleState(): void {
    if (!this.engine) {
      return;
    }
    this.furnitureAvailable.set(this.engine.isCurrentFloorplanDefault);
    this.budget.set(this.engine.getBudget());
  }

  private handleError(error: unknown): void {
    this.status.set('error');
    this.errorMessage.set(error instanceof Error ? error.message : 'Error desconocido al iniciar el visor 3D.');
  }
}
