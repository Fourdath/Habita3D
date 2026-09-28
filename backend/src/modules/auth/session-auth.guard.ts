import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { AuthService, PublicUser } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  authenticatedUser: PublicUser;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.authenticatedUser = await this.authService.getUserFromAuthorization(
      request.headers.authorization,
    );
    return true;
  }
}
