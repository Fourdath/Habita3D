import { timingSafeEqual } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class MaterialsImportGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.MATERIALS_API_TOKEN ?? '';
    if (configured.length < 24 || configured.startsWith('replace-')) {
      throw new ServiceUnavailableException(
        'Configure MATERIALS_API_TOKEN para importar capturas',
      );
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-materials-token'];
    if (typeof provided !== 'string')
      throw new UnauthorizedException('Credencial de captura inválida');
    const expected = Buffer.from(configured);
    const received = Buffer.from(provided);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new UnauthorizedException('Credencial de captura inválida');
    }
    return true;
  }
}
