import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface Rule {
  method: string;
  path: RegExp;
  limit: number;
}

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
const PROJECT = '/api/projects/\\d+';
const SUGGESTIONS = `${PROJECT}/rooms/[^/]+/suggestions`;
const RULES: readonly Rule[] = [
  { method: 'POST', path: /^\/api\/auth\/login\/?$/i, limit: 12 },
  { method: 'POST', path: /^\/api\/auth\/register\/?$/i, limit: 8 },
  { method: 'POST', path: /^\/api\/projects\/preview\/?$/i, limit: 24 },
  { method: 'GET', path: new RegExp(`^${PROJECT}/budget/?$`, 'i'), limit: 90 },
  { method: 'GET', path: new RegExp(`^${SUGGESTIONS}/?$`, 'i'), limit: 90 },
  {
    method: 'POST',
    path: new RegExp(`^${SUGGESTIONS}/accept/?$`, 'i'),
    limit: 30,
  },
  { method: 'POST', path: /^\/api\/captures\/?$/i, limit: 8 },
];

@Injectable()
export class RequestRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  private nextSweep = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // Express may resolve a percent-encoded route parameter, so normalize it before matching.
    let path = request.path;
    try {
      path = decodeURIComponent(path);
    } catch {
      return true;
    }
    const index = RULES.findIndex(
      (rule) =>
        rule.method === (request.method === 'HEAD' ? 'GET' : request.method) &&
        rule.path.test(path),
    );
    if (index === -1) return true;

    const now = performance.now();
    if (now >= this.nextSweep) {
      for (const [key, bucket] of this.buckets)
        if (bucket.expiresAt <= now) this.buckets.delete(key);
      this.nextSweep = now + WINDOW_MS;
    }

    // The connected peer is authoritative. Untrusted forwarding headers cannot reset a quota.
    const key = `${index}:${request.socket.remoteAddress ?? 'unknown'}`;
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      if (!bucket && this.buckets.size >= MAX_BUCKETS)
        return this.reject(context, WINDOW_MS);
      bucket = { count: 0, expiresAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= RULES[index].limit)
      return this.reject(context, bucket.expiresAt - now);
    bucket.count++;
    return true;
  }

  private reject(context: ExecutionContext, waitMs: number): never {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', Math.max(1, Math.ceil(waitMs / 1000)));
    throw new HttpException(
      { code: 'rate_limited', message: 'Espera y vuelve a intentarlo.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
