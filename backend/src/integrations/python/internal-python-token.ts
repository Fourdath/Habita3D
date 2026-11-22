import { ServiceUnavailableException } from '@nestjs/common';

export function internalPythonToken(): string {
  const token = process.env.MATERIALS_API_TOKEN ?? '';
  if (token.length < 24 || token.length > 256 || token.startsWith('replace-')) {
    throw new ServiceUnavailableException(
      'Configure la credencial interna de Python',
    );
  }
  return token;
}
