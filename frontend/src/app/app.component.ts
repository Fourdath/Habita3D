import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly updates = inject(SwUpdate, { optional: true });
  protected readonly updateMessage = signal('');

  constructor() {
    if (this.updates?.isEnabled) {
      this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe(event => {
        if (event.type === 'VERSION_READY') {
          this.updateMessage.set('Hay una versión nueva de Habita3D. Guarda tus cambios antes de actualizar.');
        }
      });
      this.updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => {
        this.updateMessage.set('Faltan recursos para abrir Habita3D. Vuelve a cargar la aplicación con conexión.');
      });
    }
  }

  protected reloadApp(): void {
    window.location.reload();
  }
}
