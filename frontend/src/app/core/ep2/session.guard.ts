import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const requireSession: CanActivateFn = async (route, state) => {
  if (route.routeConfig?.path === 'viewer-3d' && !route.queryParamMap.has('project')) return true;

  const session = inject(SessionService);
  const router = inject(Router);
  const login = (reason?: string) => router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url, reason } });

  if (!session.hasSession()) return login(session.expired() ? 'expired' : undefined);
  if (session.user()) return true;
  try {
    await session.restore();
    return session.user() ? true : login(session.expired() ? 'expired' : undefined);
  } catch {
    return login('unavailable');
  }
};

export function privateReturnUrl(value: string | null): string {
  const route = value?.split(/[?#]/, 1)[0];
  return value && (route === '/projects' || route === '/viewer-3d') ? value : '/projects';
}
