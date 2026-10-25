import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { MaterialsController } from '../src/modules/materials/materials.controller.js';
import { MaterialsImportGuard } from '../src/modules/materials/materials-token.guard.js';
import { MaterialsService } from '../src/modules/materials/materials.service.js';

describe('Materials HTTP contract and protected import', () => {
  let app: INestApplication;
  const previousToken = process.env.MATERIALS_API_TOKEN;
  const token = 'disposable-materials-http-test-credential';
  const service = {
    catalogue: vi.fn(async (query) => ({
      items: [],
      total: 0,
      page: query.page,
      limit: query.limit,
    })),
    status: vi.fn(async () => ({ storage: 'postgresql', publicationCount: 0 })),
    importCapture: vi.fn(async () => ({ runId: 'test', replayed: false })),
    history: vi.fn(async () => ({ items: [] })),
    findOne: vi.fn(async () => ({ publicationKey: 'test' })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.MATERIALS_API_TOKEN = token;
    const module = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [
        { provide: MaterialsService, useValue: service },
        MaterialsImportGuard,
      ],
    }).compile();
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
    if (previousToken === undefined) delete process.env.MATERIALS_API_TOKEN;
    else process.env.MATERIALS_API_TOKEN = previousToken;
  });

  it('serves persisted reads without import credentials and never invokes acquisition', async () => {
    const result = await request(app.getHttpServer())
      .get(
        '/api/materials?category=ceramic&source=sodimac&minPricePerM2=0&maxPricePerM2=5000.50&page=2&limit=5',
      )
      .expect(200);
    expect(result.body).toEqual({ items: [], total: 0, page: 2, limit: 5 });
    expect(service.catalogue).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'ceramic',
        source: 'sodimac',
        page: 2,
        limit: 5,
      }),
    );
    expect(service.importCapture).not.toHaveBeenCalled();
  });

  it.each([
    'category=vinyl',
    'source=other',
    'page=0',
    'page=1.2',
    'limit=101',
    'minPricePerM2=-1',
    'maxPricePerM2=Infinity',
    'minPricePerM2=1.001',
    'source=sodimac&source=easy',
    'sort=price',
  ])('rejects unsupported query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/materials?${query}`)
      .expect(400);
    expect(service.catalogue).not.toHaveBeenCalled();
  });

  it('keeps status as a static route instead of treating it as a publication key', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/materials/status')
      .expect(200);
    expect(result.body.storage).toBe('postgresql');
    expect(service.status).toHaveBeenCalledOnce();
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('blocks import without the operator credential, while accepting a configured credential', async () => {
    await request(app.getHttpServer())
      .post('/api/materials/import')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/materials/import')
      .set('X-Materials-Token', 'incorrect')
      .send({})
      .expect(401);
    expect(service.importCapture).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/api/materials/import')
      .set('X-Materials-Token', token)
      .send({ test: 'forwarded-to-validator' })
      .expect(201);
    expect(service.importCapture).toHaveBeenCalledWith({
      test: 'forwarded-to-validator',
    });
  });

  it('fails closed when no operator credential is configured', async () => {
    delete process.env.MATERIALS_API_TOKEN;
    await request(app.getHttpServer())
      .post('/api/materials/import')
      .set('X-Materials-Token', token)
      .send({})
      .expect(503);
    process.env.MATERIALS_API_TOKEN = 'replace-operator-credential-please';
    await request(app.getHttpServer())
      .post('/api/materials/import')
      .set('X-Materials-Token', token)
      .send({})
      .expect(503);
    expect(service.importCapture).not.toHaveBeenCalled();
  });
});
