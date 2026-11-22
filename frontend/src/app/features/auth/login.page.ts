import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { privateReturnUrl } from '../../core/ep2/session.guard';
import { SessionService } from '../../core/ep2/session.service';
import { BrandMarkComponent } from '../landing/components/brand-mark.component';

@Component({
  selector: 'app-login',
  imports: [IonContent, ReactiveFormsModule, RouterLink, BrandMarkComponent],
  templateUrl: './login.page.html',
})
export class LoginPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  readonly mode = signal<'login' | 'register'>('login');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
  });

  get reason(): string | null { return this.route.snapshot.queryParamMap.get('reason'); }

  ionViewDidEnter(): void { this.title().nativeElement.focus(); }

  changeMode(): void {
    this.mode.update(mode => mode === 'login' ? 'register' : 'login');
    this.form.controls.password.reset();
    this.error.set('');
    this.title().nativeElement.focus();
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa el correo y escribe una contraseña de 12 a 128 caracteres.');
      return;
    }
    await this.continue(async () => {
      const { email, password } = this.form.getRawValue();
      await this.session.authenticate(this.mode(), email, password);
      this.form.controls.password.reset();
    });
  }

  async retrySession(): Promise<void> {
    if (this.busy()) return;
    await this.continue(() => this.session.restore());
  }

  private async continue(operation: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
      if (!this.session.user()) {
        this.error.set('La sesión ya no está disponible. Inicia sesión nuevamente.');
        return;
      }
      const returnUrl = privateReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
      await this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    } catch (error) {
      this.error.set(loginError(error));
    } finally {
      this.busy.set(false);
    }
  }
}

function loginError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'El correo o la contraseña son incorrectos.';
    if (error.status === 409) return 'Ya existe una cuenta con ese correo. Puedes iniciar sesión.';
    if (error.status === 429) return 'Hay demasiados intentos. Espera un momento y vuelve a intentar.';
    if (error.status === 0 || error.status >= 500) return 'No pudimos conectar con el servicio. Comprueba la conexión e inténtalo de nuevo.';
  }
  return 'No se pudo completar el acceso. Revisa los datos e inténtalo de nuevo.';
}
