import type { HttpInterceptorFn } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

export const nativeStagingApiInterceptor: HttpInterceptorFn = (request, next) => {
  const origin = environment.androidStagingApiOrigin;
  if (origin && Capacitor.getPlatform() === 'android' && request.url.startsWith('/api/')) {
    return next(request.clone({ url: `${origin}${request.url}` }));
  }

  return next(request);
};
