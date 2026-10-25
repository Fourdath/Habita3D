import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CapturesService } from '../src/modules/captures/captures.service.js';
import { chileDisplay, type CapturedResult } from '../src/modules/materials/capture-contract.js';
import { httpObservability } from '../src/observability/http-observability.js';

// Run only against an operator-selected disposable database with deployed migrations.
// The HTTP specialist below is a deterministic test double. No retailer is contacted.
describe.runIf(process.env.RUN_DATABASE_TESTS === 'true')('EP2 PostgreSQL persistence and APIs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let upstream: Server;
  let fixture: CapturedResult;
  let tag: string;
  let sequence = 0;
  let budgetCalls = 0;
  let captureCalls = 0;
  let upstreamFailure = false;
  let releaseCapture: (() => void) | undefined;
  let holdCapture = false;
  const userIds: number[] = [];
  const runIds = new Set<string>();
  const operatorToken = 'ep2-test-operator-token-not-a-secret';
  const originalPython = process.env.PYTHON_SERVICE_URL;
  const originalToken = process.env.MATERIALS_API_TOKEN;
  const originalSchedule = process.env.MATERIALS_SCHEDULE_ENABLED;

  function stamp(base: CapturedResult, offsetMinutes = 0): CapturedResult {
    const f = structuredClone(base);
    f.run_id = `${tag}-${++sequence}`;
    runIds.add(f.run_id);
    const checked = new Date(Date.now() - 3_600_000 + sequence * 60_000 + offsetMinutes * 60_000);
    f.started_at = new Date(checked.getTime() - 1000).toISOString();
    f.finished_at = new Date(checked.getTime() + 1000).toISOString();
    for (const p of f.publications) { p.checked_at = checked.toISOString(); p.last_checked_display = chileDisplay(checked); }
    return f;
  }

  async function startApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(httpObservability);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  }

  beforeAll(async () => {
    process.env.MATERIALS_API_TOKEN = operatorToken;
    process.env.MATERIALS_SCHEDULE_ENABLED = 'false';
    upstream = createServer(async (req, res) => {
      const respond = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.url === '/health') { respond(200, { status: 'ok' }); return; }
      let raw = '';
      for await (const chunk of req) raw += String(chunk);
      const body = JSON.parse(raw || '{}');
      if (req.url === '/materials/captures') {
        captureCalls++;
        if (holdCapture) await new Promise<void>(resolve => { releaseCapture = resolve; });
        if (upstreamFailure) { respond(503, { message: 'controlled source failure' }); return; }
        const result = stamp(fixture);
        result.request_id = String(req.headers['x-request-id']);
        result.trigger = body.scheduled_for ? 'scheduled' : 'manual';
        result.scheduled_for = body.scheduled_for ?? null;
        respond(200, result); return;
      }
      if (req.url === '/floors/budget') {
        budgetCalls++;
        const rows = body.rooms.map((r: Record<string, any>) => {
          // This fixture exercises a known 10m² room, 10% waste, 2m²/box: six boxes.
          expect(r.area_m2).toBe('10');
          expect(r.publication.coverage_per_box_m2).toBe('2');
          const cost = 6 * r.publication.price_per_box_clp;
          const difference = r.budget_clp === null ? null : r.budget_clp - cost;
          return { room_id: r.room_id, publication_key: r.publication.publication_key, source: r.publication.source,
            currency: 'CLP', price_type: 'public', status: 'calculated', reasons: [], area_m2: '10', waste_percent: '10',
            required_area_m2: '11', coverage_per_box_m2: '2', price_per_box_clp: r.publication.price_per_box_clp,
            boxes: 6, purchased_area_m2: '12', cost_clp: cost, budget_clp: r.budget_clp,
            budget_difference_clp: difference, budget_excess_clp: difference === null ? null : Math.max(0, -difference),
            fits_budget: difference === null ? null : difference >= 0, availability: r.publication.availability,
            checked_at: r.publication.checked_at, last_check_display: chileDisplay(r.publication.checked_at) };
        });
        const total = rows.reduce((sum: number, r: { cost_clp: number }) => sum + r.cost_clp, 0);
        const difference = body.budget_clp - total;
        respond(200, { currency: 'CLP', status: 'complete', rooms: rows, calculated_rooms: rows.length,
          uncalculable_rooms: 0, calculable_subtotal_clp: total, total_cost_clp: total, budget_clp: body.budget_clp,
          budget_difference_clp: difference, budget_excess_clp: Math.max(0, -difference), fits_budget: difference >= 0,
          calculation_basis: 'supplied_publication_snapshots', scope: 'floor_boxes_only' }); return;
      }
      respond(404, {});
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    process.env.PYTHON_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    await startApp();
  });

  beforeEach(async () => {
    tag = `ep2-db-${randomUUID()}`;
    fixture = JSON.parse(await readFile(new URL('./fixtures/ep2-capture.json', import.meta.url), 'utf8'));
    for (const p of fixture.publications) {
      p.external_id = `${tag}-${p.source}`;
      p.publication_key = createHash('sha256').update(`${p.source}|${p.external_id}|${p.sku ?? ''}|${p.seller.toLowerCase()}|13110|CLP|public`).digest('hex');
    }
    fixture.updated_publication_keys = fixture.publications.map(p => p.publication_key);
    fixture = stamp(fixture);
    upstreamFailure = false; holdCapture = false; releaseCapture = undefined;
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(fixture).expect(201);
  });

  afterEach(async () => {
    releaseCapture?.();
    const keys = fixture.publications.map(p => p.publication_key);
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    await prisma.priceObservation.deleteMany({ where: { publicationKey: { in: keys } } });
    await prisma.publication.deleteMany({ where: { publicationKey: { in: keys } } });
    await prisma.captureRun.deleteMany({ where: { runId: { in: [...runIds] } } });
    runIds.clear();
    await prisma.captureJob.deleteMany({ where: { requestId: { startsWith: tag } } });
  });

  afterAll(async () => {
    releaseCapture?.();
    await app?.close();
    await new Promise<void>(resolve => upstream?.close(() => resolve()));
    for (const [key, old] of [['PYTHON_SERVICE_URL', originalPython], ['MATERIALS_API_TOKEN', originalToken], ['MATERIALS_SCHEDULE_ENABLED', originalSchedule]]) {
      if (old === undefined) delete process.env[key!]; else process.env[key!] = old;
    }
  });

  async function register(suffix: string) {
    const result = await request(app.getHttpServer()).post('/api/auth/register')
      .send({ email: `${tag}-${suffix}@example.invalid`, password: 'demo-strong-password-123' }).expect(201);
    userIds.push(result.body.user.id);
    return `Bearer ${result.body.accessToken}`;
  }

  it('persists idempotently, preserves timestamps on failure, filters decimals and records real changes only', async () => {
    const key = fixture.publications[0].publication_key;
    const initial = await request(app.getHttpServer()).get(`/api/materials/${key}/history`).expect(200);
    expect(initial.body.total).toBe(1);
    const replay = await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(fixture).expect(201);
    expect(replay.body.replayed).toBe(true);
    const same = stamp(fixture);
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(same).expect(201);
    expect((await request(app.getHttpServer()).get(`/api/materials/${key}/history`)).body.total).toBe(1);
    expect((await request(app.getHttpServer()).get(`/api/materials/${key}`)).body.checkedAt).toBe(same.publications[0].checked_at);
    const changed = stamp(fixture);
    changed.publications[0].price_per_box_clp += 1000;
    changed.publications[0].price_per_m2_clp = '5500.00';
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(changed).expect(201);
    expect((await request(app.getHttpServer()).get(`/api/materials/${key}/history`)).body.total).toBe(2);
    const clash = structuredClone(changed); clash.request_id = 'different payload';
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(clash).expect(409);
    const failed = stamp(fixture);
    failed.status = 'failed'; failed.updated_publication_keys = []; failed.retained_publication_keys = fixture.updated_publication_keys;
    failed.publications = changed.publications;
    for (const g of failed.groups) { g.status = 'failed'; g.metrics.selected_records = 0; g.missing_publication_keys = failed.publications.filter(p => p.source === g.source).map(p => p.publication_key); }
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(failed).expect(201);
    const retained = await request(app.getHttpServer()).get(`/api/materials/${key}`).expect(200);
    expect(retained.body.pricePerBoxClp).toBe(11000);
    expect(retained.body.checkedAt).toBe(changed.publications[0].checked_at);
    expect(retained.body.lastAttempt.status).toBe('failed');
    const filtered = await request(app.getHttpServer()).get('/api/materials?source=sodimac&category=ceramic&minPricePerM2=5499.99&maxPricePerM2=5500.00').expect(200);
    expect(filtered.body.items.map((p: { publicationKey: string }) => p.publicationKey)).toContain(key);
    await request(app.getHttpServer()).get('/api/materials?page=0').expect(400);
  });

  it('isolates owners and recalculates current prices while retaining room choices', async () => {
    const owner = await register('owner'); const other = await register('other');
    const created = await request(app.getHttpServer()).post('/api/projects').set('Authorization', owner)
      .send({ name: 'Proyecto de prueba', budgetClp: 100000 }).expect(201);
    const id = created.body.id;
    await request(app.getHttpServer()).get(`/api/projects/${id}`).set('Authorization', other).expect(404);
    await request(app.getHttpServer()).patch(`/api/projects/${id}`).set('Authorization', other).send({ name: 'No autorizado' }).expect(404);
    const selected = fixture.publications.find(p => p.source === 'sodimac')!;
    const room = await request(app.getHttpServer()).post(`/api/projects/${id}/rooms`).set('Authorization', owner)
      .send({ name: 'Living', areaMode: 'area', areaM2: '10', publicationKey: selected.publication_key }).expect(201);
    const beforeCalls = captureCalls;
    const original = await request(app.getHttpServer()).get(`/api/projects/${id}/budget`).set('Authorization', owner).set('X-Request-ID', tag).expect(200);
    expect(original.body.total_cost_clp).toBe(60000);
    expect(original.headers['x-request-id']).toBe(tag);
    const changed = stamp(fixture);
    const floor = changed.publications.find(p => p.source === 'sodimac')!;
    floor.price_per_box_clp = 12000; floor.price_per_m2_clp = '6000.00';
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(changed).expect(201);
    const updated = await request(app.getHttpServer()).get(`/api/projects/${id}/budget`).set('Authorization', owner).expect(200);
    expect(updated.body.total_cost_clp).toBe(72000);
    expect(updated.body.rooms[0].room_id).toBe(room.body.id);
    expect(updated.body.rooms[0].publication_key).toBe(selected.publication_key);
    expect(captureCalls).toBe(beforeCalls);
    await request(app.getHttpServer()).post(`/api/projects/${id}/rooms`).set('Authorization', owner)
      .send({ name: 'Dormitorio sin selección', areaMode: 'dimensions', lengthM: '4', widthM: '3' }).expect(201);
    const partial = await request(app.getHttpServer()).get(`/api/projects/${id}/budget`).set('Authorization', owner).expect(200);
    expect(partial.body.status).toBe('partial'); expect(partial.body.total_cost_clp).toBeNull();
    expect(partial.body.unselected_room_ids).toHaveLength(1);
    expect(budgetCalls).toBeGreaterThan(0);
  });

  it('uses real database locks to exclude concurrent acquisition and records transport failure', async () => {
    holdCapture = true;
    const running = request(app.getHttpServer()).post('/api/captures').set('X-Materials-Token', operatorToken).set('X-Request-ID', tag).send({}).then(r => r);
    for (let i = 0; !releaseCapture && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(releaseCapture).toBeDefined();
    await request(app.getHttpServer()).post('/api/captures').set('X-Materials-Token', operatorToken).send({}).expect(409);
    holdCapture = false; releaseCapture!();
    expect((await running).status).toBe(200);
    upstreamFailure = true;
    await request(app.getHttpServer()).post('/api/captures').set('X-Materials-Token', operatorToken).set('X-Request-ID', tag).send({}).expect(502);
    const status = await request(app.getHttpServer()).get('/api/captures/status').expect(200);
    expect(status.body.latestJob.status).toBe('failed');
    expect(await prisma.publication.count({ where: { publicationKey: { in: fixture.updated_publication_keys } } })).toBe(2);
  });

  it('attempts a scheduled slot once across application restarts', async () => {
    const slot = new Date('2026-07-05T12:00:00Z');
    const count = captureCalls;
    await app.get(CapturesService).run({}, `${tag}-slot`, slot);
    await app.close(); await startApp();
    const second = await app.get(CapturesService).run({}, `${tag}-slot`, slot);
    expect(second.status).toBe('skipped'); expect(captureCalls).toBe(count + 1);
    const ready = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(ready.body.services).toEqual({ postgres: 'ok', python: 'ok' });
    const catalog = await request(app.getHttpServer()).get('/api/materials').expect(200);
    expect(catalog.body.total).toBeGreaterThanOrEqual(2);
  });

  it('closes orphaned attempts after restart without repeating a retailer request', async () => {
    const id = `scheduled:orphan-${tag}`;
    const calls = captureCalls;
    await prisma.captureJob.create({ data: { id, status: 'running', startedAt: new Date(), requestId: tag } });
    await app.close(); await startApp();
    const recovered = await prisma.captureJob.findUniqueOrThrow({ where: { id } });
    expect(recovered.status).toBe('failed');
    expect(recovered.errorCode).toBe('interrupted_before_completion');
    expect(captureCalls).toBe(calls);
  });

  it('rejects unauthorized imports and invalid contracts without partial writes', async () => {
    await request(app.getHttpServer()).post('/api/materials/import').send(fixture).expect(401);
    await request(app.getHttpServer()).post('/api/captures').send({}).expect(401);
    const invalid = stamp(fixture);
    invalid.publications[0].price_per_box_clp = -1;
    await request(app.getHttpServer()).post('/api/materials/import').set('X-Materials-Token', operatorToken).send(invalid).expect(400);
    expect(await prisma.captureRun.findUnique({ where: { runId: invalid.run_id } })).toBeNull();
  });
});
