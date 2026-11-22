import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { sessionInterceptor } from './session.interceptor';
import { SessionService } from './session.service';

describe('EP2 session', () => {
  let http: HttpTestingController;
  const token = 'a'.repeat(43), user = { id: 1, email: 'demo@example.test' };
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); sessionStorage.clear(); });
  it('stores only the tab-local session, never the password', async () => {
    const session = TestBed.inject(SessionService);
    const promise = session.authenticate('register', ' DEMO@example.test ', 'test-only-password');
    const request = http.expectOne('/api/auth/register');
    expect(request.request.body.email).toBe('demo@example.test');
    request.flush({ accessToken: token, user, expiresAt: '2099-01-01T00:00:00Z' }); await promise;
    expect(session.headers().get('Authorization')).toBe(`Bearer ${token}`);
    expect(sessionStorage.getItem('habita3d.ep2.session')).not.toContain('test-only-password');
    expect(localStorage.length).toBe(0);
  });
  it('restores identity from the server after a reload and clears rejected sessions', async () => {
    sessionStorage.setItem('habita3d.ep2.session', JSON.stringify({ accessToken: token, expiresAt: '2099-01-01T00:00:00Z' }));
    const session = TestBed.inject(SessionService);
    const restored = session.restore();
    const request = http.expectOne('/api/auth/me');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    request.flush(user);
    await restored;
    expect(session.user()).toEqual(user);
    const rejected = session.restore(); http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' }); await rejected;
    expect(session.user()).toBeNull(); expect(session.headers().has('Authorization')).toBe(false);
  });
  it('never reuses an expired stored token', async () => {
    sessionStorage.setItem('habita3d.ep2.session', JSON.stringify({ accessToken: token, expiresAt: '2000-01-01T00:00:00Z' }));
    const session = TestBed.inject(SessionService); await session.restore();
    http.expectNone('/api/auth/me'); expect(session.user()).toBeNull(); expect(session.expired()).toBe(true);
  });
  it('redirects an expired private request back to login with its project context', async () => {
    sessionStorage.setItem('habita3d.ep2.session', JSON.stringify({ accessToken: token, expiresAt: '2099-01-01T00:00:00Z' }));
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/viewer-3d?project=7&room=living');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const client = TestBed.inject(HttpClient);
    const result = firstValueFrom(client.get('/api/projects/7'));
    http.expectOne('/api/projects/7').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'expired', returnUrl: '/viewer-3d?project=7&room=living' }, replaceUrl: true,
    });
  });
  it('keeps public and external requests free of the session token', async () => {
    sessionStorage.setItem('habita3d.ep2.session', JSON.stringify({ accessToken: token, expiresAt: '2099-01-01T00:00:00Z' }));
    const client = TestBed.inject(HttpClient);
    for (const url of ['/api/projects/preview', '/api/materials', 'https://example.test/api/projects']) {
      const result = firstValueFrom(client.get(url));
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
      await result;
    }
    expect(TestBed.inject(SessionService).hasSession()).toBe(true);
  });
  it('preserves credentials on temporary loss of connection during session restore', async () => {
    sessionStorage.setItem('habita3d.ep2.session', JSON.stringify({ accessToken: token, expiresAt: '2099-01-01T00:00:00Z' }));
    const session = TestBed.inject(SessionService);
    const attempt = session.restore();
    http.expectOne('/api/auth/me').error(new ProgressEvent('error'));
    await expect(attempt).rejects.toMatchObject({ status: 0 });
    expect(session.hasSession()).toBe(true);
    const retry = session.restore();
    http.expectOne('/api/auth/me').flush(user);
    await retry;
    expect(session.user()).toEqual(user);
  });
});
