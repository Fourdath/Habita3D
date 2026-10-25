import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export function materialsTokenConfigured() {
  const token = process.env.MATERIALS_API_TOKEN ?? '';
  return token.length >= 24 && token.length <= 256 && !token.startsWith('replace-');
}

@Injectable()
export class MaterialsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!materialsTokenConfigured()) throw new ServiceUnavailableException('Configure la credencial interna de captura');
    const token = Buffer.from(process.env.MATERIALS_API_TOKEN!, 'utf8');
    const supplied = Buffer.from(context.switchToHttp().getRequest<Request>().get('x-materials-token') ?? '', 'utf8');
    if (token.length !== supplied.length || !timingSafeEqual(token, supplied)) {
      throw new UnauthorizedException('Credencial de captura inválida');
    }
    return true;
  }
}
