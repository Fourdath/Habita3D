import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

type StoredUser = { id: number; email: string; createdAt: Date };

export type PublicUser = {
  id: number;
  email: string;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    const passwordHash = await this.hashPassword(dto.password);
    let user: StoredUser;

    try {
      user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }

    return this.createSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Keep the cost similar for unknown accounts and incorrect passwords.
      await this.derivePassword(dto.password, Buffer.alloc(16));
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSession(user);
  }

  async getUserFromAuthorization(authorization: string | undefined): Promise<PublicUser> {
    const token = this.parseBearerToken(authorization);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return this.toPublicUser(session.user);
  }

  async logout(authorization: string | undefined): Promise<void> {
    const token = this.parseBearerToken(authorization);
    await this.prisma.session.deleteMany({
      where: { tokenHash: this.hashToken(token) },
    });
  }

  private async createSession(user: StoredUser) {
    const accessToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await this.prisma.session.create({
      data: {
        tokenHash: this.hashToken(accessToken),
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresAt,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: StoredUser): PublicUser {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }

  private parseBearerToken(authorization: string | undefined): string {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization ?? '');
    if (!match) {
      throw new UnauthorizedException('Bearer token required');
    }
    return match[1];
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await this.derivePassword(password, salt);
    return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  private async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [algorithm, encodedSalt, encodedKey] = encoded.split('$');
    if (algorithm !== 'scrypt' || !encodedSalt || !encodedKey) {
      return false;
    }

    const salt = Buffer.from(encodedSalt, 'base64url');
    const expected = Buffer.from(encodedKey, 'base64url');
    if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) {
      return false;
    }

    const actual = await this.derivePassword(password, salt);
    return timingSafeEqual(actual, expected);
  }

  private derivePassword(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
