import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { privateReturnUrl, requireSession } from './session.guard';
import { SessionService } from './session.service';

@Component({ template: '' })
class EmptyPage {}

describe('private navigation', () => {
  let session: { hasSession: ReturnType<typeof vi.fn>; user: ReturnType<typeof vi.fn>; expired: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    session = { hasSession: vi.fn(() => false), user: vi.fn(() => null), expired: vi.fn(() => false), restore: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: SessionService, useValue: session },
      provideRouter([
        { path: 'login', component: EmptyPage },
        { path: 'projects', component: EmptyPage, canActivate: [requireSession] },
        { path: 'viewer-3d', component: EmptyPage, canActivate: [requireSession], runGuardsAndResolvers: 'paramsOrQueryParamsChange' },
      ]),
    ] });
  });

  it('allows the example viewer and protects the project viewer on query changes', async () => {
    const harness = await RouterTestingHarness.create('/viewer-3d');
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/viewer-3d');
    await harness.navigateByUrl('/viewer-3d?project=7&room=living');
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe('/viewer-3d?project=7&room=living');
    expect(router.url).toMatch(/^\/login\?/);
  });

  it('preserves the requested project when a stored session cannot be verified', async () => {
    session.hasSession.mockReturnValue(true);
    session.restore.mockRejectedValue(new Error('Temporary offline state'));
    await RouterTestingHarness.create('/projects?project=7');
    const router = TestBed.inject(Router);
    expect(router.parseUrl(router.url).queryParams).toEqual({ returnUrl: '/projects?project=7', reason: 'unavailable' });
  });

  it('only accepts the application project routes as post-login destinations', () => {
    expect(privateReturnUrl('/viewer-3d?project=7')).toBe('/viewer-3d?project=7');
    expect(privateReturnUrl('//example.test/projects')).toBe('/projects');
    expect(privateReturnUrl('/login')).toBe('/projects');
  });
});
