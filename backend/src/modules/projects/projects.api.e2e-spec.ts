import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../database/prisma.service.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ProjectsModule } from './projects.module.js';

const roomId = '32344a38-1e52-4d6f-bdf6-39bd2ce1e5c0';

describe('EP2 projects authorization and DTOs (HTTP)', () => {
  let app: INestApplication;
  let findFirst: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let calculateBudget: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const project = {
      id: 1,
      name: 'Casa',
      budgetClp: 100_000n,
      ownerId: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
      rooms: [],
    };
    findFirst = vi.fn(
      async ({ where }: { where: { id: number; ownerId: number } }) =>
        where.id === 1 && where.ownerId === 7 ? project : null,
    );
    create = vi.fn(
      async ({
        data,
      }: {
        data: { name: string; ownerId: number; budgetClp: bigint };
      }) => ({ ...project, ...data }),
    );
    const fake = {
      project: {
        findFirst,
        create,
        findMany: vi.fn(async () => [project]),
        update: vi.fn(async () => project),
        delete: vi.fn(async () => project),
      },
      $queryRaw: vi.fn(async (_sql: TemplateStringsArray, id: number, ownerId: number) => ownerId === 7 && id === 1 ? [{ id }] : []),
      $transaction: vi.fn(),
    };
    fake.$transaction.mockImplementation(
      async (fn: (db: typeof fake) => Promise<unknown>) => fn(fake),
    );
    calculateBudget = vi.fn();
    const fixture = await Test.createTestingModule({
      imports: [ProjectsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fake)
      .overrideProvider(PythonService)
      .useValue({ calculateBudget })
      .overrideProvider(AuthService)
      .useValue({
        async getUserFromAuthorization(header: string | undefined) {
          if (header !== 'Bearer owner' && header !== 'Bearer other')
            throw new UnauthorizedException();
          return {
            id: header === 'Bearer owner' ? 7 : 8,
            email: 'ficticio@example.test',
            createdAt: new Date(),
          };
        },
      })
      .compile();
    app = fixture.createNestApplication();
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

  it.each([
    ['get', '/api/projects'],
    ['post', '/api/projects'],
    ['get', '/api/projects/1'],
    ['patch', '/api/projects/1'],
    ['delete', '/api/projects/1'],
    ['get', '/api/projects/1/budget'],
    ['post', '/api/projects/1/rooms'],
    ['patch', `/api/projects/1/rooms/${roomId}`],
    ['delete', `/api/projects/1/rooms/${roomId}`],
  ] as const)('requires a session for %s %s', async (method, url) => {
    await request(app.getHttpServer())[method](url).expect(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(calculateBudget).not.toHaveBeenCalled();
  });

  it('assigns the owner from the session and serializes whole CLP safely', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', 'Bearer owner')
      .send({ name: '  Casa EP2  ', budgetClp: 200_000 })
      .expect(201);
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Casa EP2', ownerId: 7, budgetClp: 200_000n },
    });
    expect(response.body.budgetClp).toBe(200_000);
    expect(response.body.ownerId).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', 'Bearer owner')
      .send({ name: 'Casa', budgetClp: 200_000, ownerId: 8 })
      .expect(400);
  });

  it('hides another owner’s projects on reads, updates and budgets', async () => {
    await request(app.getHttpServer())
      .get('/api/projects/1')
      .set('Authorization', 'Bearer other')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/projects/1/budget')
      .set('Authorization', 'Bearer other')
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/projects/1')
      .set('Authorization', 'Bearer other')
      .send({ name: 'Intrusión' })
      .expect(404);
    await request(app.getHttpServer())
      .delete('/api/projects/1')
      .set('Authorization', 'Bearer other')
      .expect(404);
    expect(calculateBudget).not.toHaveBeenCalled();
  });

  it('hides another owner’s room resources before mutations', async () => {
    await request(app.getHttpServer())
      .post('/api/projects/1/rooms')
      .set('Authorization', 'Bearer other')
      .send({ name: 'Pieza', areaMode: 'area', areaM2: '10' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/projects/1/rooms/${roomId}`)
      .set('Authorization', 'Bearer other')
      .send({ publicationKey: null })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/projects/1/rooms/${roomId}`)
      .set('Authorization', 'Bearer other')
      .expect(404);
  });

  it('rejects unknown fields and invalid values before hitting persistence', async () => {
    const bodies = [
      { name: 'Pieza', areaMode: 'area', areaM2: true },
      { name: 'Pieza', areaMode: 'area', areaM2: '0.0000001' },
      { name: 'Pieza', areaMode: 'area', areaM2: '10', wastePercent: '101' },
      { name: 'Pieza', areaMode: 'area', areaM2: '10', pricePerBoxClp: 1 },
    ];
    for (const body of bodies) {
      await request(app.getHttpServer())
        .post('/api/projects/1/rooms')
        .set('Authorization', 'Bearer owner')
        .send(body)
        .expect(400);
    }
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('keeps the public EP1 demo validation separate from private EP2 operations', async () => {
    await request(app.getHttpServer())
      .post('/api/projects/preview')
      .send({ name: 'Demo', areaM2: -1, budgetClp: 100 })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
});
