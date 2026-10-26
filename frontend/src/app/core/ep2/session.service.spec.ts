import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

describe('EP2 session', () => {
  let http: HttpTestingController;
  const token = 'a'.repeat(43), user = { id: 1, email: 'demo@example.test' };
  beforeEach(() => { sessionStorage.clear(); TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); http = TestBed.inject(HttpTestingController); });
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
    const restored = session.restore(); http.expectOne('/api/auth/me').flush(user); await restored;
    expect(session.user()).toEqual(user);
    const rejected = session.restore(); http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' }); await rejected;
    expect(session.user()).toBeNull(); expect(session.headers().has('Authorization')).toBe(false);
  });
  it('never reuses an expired stored token', async () => {
    sessionStorage.setItem('habita3d.ep2.session', JSON.stringify({ accessToken: token, expiresAt: '2000-01-01T00:00:00Z' }));
    const session = TestBed.inject(SessionService); await session.restore();
    http.expectNone('/api/auth/me'); expect(session.user()).toBeNull();
  });
});
