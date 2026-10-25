import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function httpObservability(req: Request, res: Response, next: NextFunction) {
  const supplied = req.get('x-request-id') ?? '';
  const requestId = /^[A-Za-z0-9_-]{1,64}$/.test(supplied) ? supplied : randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  const started = performance.now();
  res.once('finish', () => {
    // Do not record bodies, query strings, authorization headers or names of users.
    console.info(JSON.stringify({ service: 'backend', event: 'http_request',
      request_id: requestId, method: req.method, route: String(req.route?.path ?? 'unmatched'),
      result: res.statusCode, duration_ms: Math.round((performance.now() - started) * 100) / 100 }));
  });
  next();
}
