import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { SessionService } from './session.service';

export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const path = request.url.split(/[?#]/, 1)[0];
  const projectRequest = /^\/api\/projects(?:\/|$)/.test(path) && path !== '/api/projects/preview';
  if (!projectRequest && path !== '/api/auth/me' && path !== '/api/auth/logout') return next(request);

  const session = inject(SessionService);
  const router = inject(Router);
  const authorization = session.headers().get('Authorization');
  const authenticated = authorization ? request.clone({ setHeaders: { Authorization: authorization } }) : request;

  return next(authenticated).pipe(tap({ error: error => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) return;
    const expired = authorization ? session.expire(authorization) : session.expired();
    if (!expired || !projectRequest) return;
    const returnUrl = router.url;
    if (/^\/(projects|viewer-3d)(?:[?#]|$)/.test(returnUrl)) {
      void router.navigate(['/login'], { queryParams: { reason: 'expired', returnUrl }, replaceUrl: true });
    }
  } }));
};
