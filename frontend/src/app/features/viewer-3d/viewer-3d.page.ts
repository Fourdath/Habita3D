import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { IonContent, IonSpinner } from '@ionic/angular';

import { Viewer3DEngine } from './engine/viewer-3d-engine';
import type { ViewerStatus } from './engine/viewer-3d.types';

@Component({
  selector: 'app-viewer-3d',
  templateUrl: 'viewer-3d.page.html',
  styleUrls: ['viewer-3d.page.scss'],
  imports: [IonContent, IonSpinner],
})
export class Viewer3DPage implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost', { static: true })
  private readonly canvasHostRef!: ElementRef<HTMLDivElement>;

  readonly status = signal<ViewerStatus>('loading');
  readonly pointerLocked = signal(false);
  readonly errorMessage = signal('');

  private engine: Viewer3DEngine | null = null;

  ngAfterViewInit(): void {
    try {
      this.engine = new Viewer3DEngine(this.canvasHostRef.nativeElement, {
        onReady: () => this.status.set('ready'),
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

  private handleError(error: unknown): void {
    this.status.set('error');
    this.errorMessage.set(error instanceof Error ? error.message : 'Error desconocido al iniciar el visor 3D.');
  }
}
