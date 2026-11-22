import type { ExecutionContext } from '@nestjs/common';

import { RequestRateLimitGuard } from './request-rate-limit.guard.js';

describe('RequestRateLimitGuard', () => {
  const setHeader = vi.fn();
  function call(
    method: string,
    path: string,
    remoteAddress = '127.0.0.1',
    forwardedFor = '192.0.2.1',
  ) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          socket: { remoteAddress },
          headers: { 'x-forwarded-for': forwardedFor },
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
  }

  it('limits login and registration separately and ignores untrusted forwarding headers', () => {
    const guard = new RequestRateLimitGuard();
    for (let i = 0; i < 12; i++)
      expect(guard.canActivate(call('POST', '/api/auth/login'))).toBe(true);
    expect(() =>
      guard.canActivate(
        call('POST', '/api/auth/login/', '127.0.0.1', '198.51.100.1'),
      ),
    ).toThrow();
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 60);
    expect(guard.canActivate(call('POST', '/api/auth/register'))).toBe(true);
    expect(
      guard.canActivate(call('POST', '/api/auth/login', '192.0.2.2')),
    ).toBe(true);
  });

  it('shares an acceptance quota across room IDs while keeping health available', () => {
    const guard = new RequestRateLimitGuard();
    for (let id = 1; id <= 30; id++) {
      expect(
        guard.canActivate(
          call('POST', `/api/projects/${id}/rooms/id-${id}/suggestions/accept`),
        ),
      ).toBe(true);
    }
    expect(() =>
      guard.canActivate(
        call('POST', '/api/projects/31/rooms/id-31/suggestions/accept'),
      ),
    ).toThrow();
    expect(guard.canActivate(call('GET', '/api/health/ready'))).toBe(true);
  });
});
