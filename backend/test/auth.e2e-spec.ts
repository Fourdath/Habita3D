import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { PrismaService } from '../src/database/prisma.service.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';

type UserRecord = {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

type SessionRecord = {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  createdAt: Date;
};

function createPrismaFake() {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();

  return {
    users,
    sessions,
    user: {
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => {
        if (users.has(data.email)) throw { code: 'P2002' };
        const now = new Date();
        const user = { id: users.size + 1, ...data, createdAt: now, updatedAt: now };
        users.set(user.email, user);
        return user;
      }),
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        users.get(where.email) ?? null,
      ),
    },
    session: {
      create: vi.fn(async ({ data }: { data: Omit<SessionRecord, 'createdAt'> }) => {
        const session = { ...data, createdAt: new Date() };
        sessions.set(data.tokenHash, session);
        return session;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const session = sessions.get(where.tokenHash);
        if (!session) return null;
        const user = [...users.values()].find((item) => item.id === session.userId);
        return user ? { ...session, user } : null;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const deleted = sessions.delete(where.tokenHash);
        return { count: Number(deleted) };
      }),
    },
  };
}

describe('Auth API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: ReturnType<typeof createPrismaFake>;

  beforeEach(async () => {
    prisma = createPrismaFake();
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('validates registration and keeps password and token hashes private', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'invalid', password: 'short' })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: '  Person@Example.com  ', password: 'a-strong-password-123' })
      .expect(201);

    expect(response.body.user.email).toBe('person@example.com');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.users.get('person@example.com')?.passwordHash).toMatch(/^scrypt\$/);
    expect(prisma.users.get('person@example.com')?.passwordHash).not.toContain(
      'a-strong-password-123',
    );
    expect(prisma.sessions.has(response.body.accessToken)).toBe(false);
  });

  it('rejects incorrect credentials and only exposes /me with a valid session', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'person@example.com', password: 'a-strong-password-123' })
      .expect(201);

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'person@example.com', password: 'wrong-password' })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'PERSON@example.com', password: 'a-strong-password-123' })
      .expect(200);
    const authorization = `Bearer ${login.body.accessToken}`;

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(me.body.email).toBe('person@example.com');
    expect(me.body.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', authorization)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', authorization)
      .expect(401);
  });

  it('rejects duplicate email and expired sessions', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'person@example.com', password: 'a-strong-password-123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'PERSON@example.com', password: 'another-password-123' })
      .expect(409);

    for (const session of prisma.sessions.values()) {
      session.expiresAt = new Date(Date.now() - 1_000);
    }

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(401);
  });
});
