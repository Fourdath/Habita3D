import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { ProjectPreviewService } from '../../core/projects/project-preview.service';
import { ProjectPreviewResponse } from '../../core/projects/project-preview.types';

@Component({
  selector: 'app-landing',
  templateUrl: 'landing.page.html',
  styleUrls: ['landing.page.scss'],
  imports: [IonContent, IonButton, RouterLink, ReactiveFormsModule],
})
export class LandingPage {
  private readonly projectPreviewService = inject(ProjectPreviewService);

  readonly previewForm = new FormGroup({
    name: new FormControl('Vivienda piloto', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    areaM2: new FormControl(65, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(10000)],
    }),
    budgetClp: new FormControl(65000000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    }),
  });

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly preview = signal<ProjectPreviewResponse | null>(null);

  async submitPreview(): Promise<void> {
    if (this.isLoading()) return;

    const { name, areaM2, budgetClp } = this.previewForm.getRawValue();
    if (this.previewForm.invalid || !name.trim()) {
      this.previewForm.markAllAsTouched();
      this.errorMessage.set('Completa los datos de la vivienda para obtener la vista previa.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.preview.set(null);

    try {
      this.preview.set(await firstValueFrom(this.projectPreviewService.createPreview({
        name: name.trim(),
        areaM2,
        budgetClp,
      })));
    } catch (error) {
      this.errorMessage.set(this.describeError(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  formatClp(amount: number): string {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'No se pudo conectar con la API. Comprueba que los servicios estén iniciados.';
      }
      if (error.status === 400) {
        return 'La API rechazó los datos. Revisa el nombre, la superficie y el presupuesto.';
      }
      if (error.status === 502 || error.status === 503 || error.status === 504) {
        return 'El servicio de recomendaciones no está disponible. Inténtalo de nuevo más tarde.';
      }
    }
    return 'No se pudo crear la vista previa. Inténtalo de nuevo.';
  }
}
