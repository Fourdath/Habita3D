import { randomUUID } from 'node:crypto';
import { BadGatewayException, BadRequestException, ConflictException, HttpException, Injectable, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';

import { PrismaService } from '../../database/prisma.service.js';
import { PythonService } from '../../integrations/python/python.service.js';
import { MaterialsService } from '../materials/materials.service.js';
import type { CaptureDto } from './capture.dto.js';
import { materialsTokenConfigured } from './materials-token.guard.js';

const ACQUISITION_LOCK = 72634102;

@Injectable()
export class CapturesService implements OnModuleDestroy, OnApplicationBootstrap {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });

  constructor(private readonly prisma: PrismaService, private readonly python: PythonService,
    private readonly materials: MaterialsService) {}

  async run(dto: CaptureDto = {}, requestId: string = randomUUID(), scheduledFor?: Date) {
    if (!materialsTokenConfigured()) throw new ServiceUnavailableException('Configure la credencial interna de captura');
    const id = scheduledFor ? `scheduled:${scheduledFor.toISOString()}` : randomUUID();
    const client = await this.pool.connect().catch(() => {
      throw new ServiceUnavailableException('No se pudo reservar la ejecución de captura');
    });
    let locked = false;
    let reserved = false;
    const started = performance.now();
    try {
      const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ACQUISITION_LOCK]);
      locked = result.rows[0]?.locked === true;
      if (!locked) throw new ConflictException('Ya hay una captura en ejecución');
      await this.markInterrupted();
      if (scheduledFor && await this.prisma.captureJob.findUnique({ where: { id } })) {
        return { jobId: id, status: 'skipped', reason: 'slot_already_attempted' };
      }
      await this.prisma.captureJob.create({ data: { id, scheduledFor, status: 'running', startedAt: new Date(), requestId } });
      reserved = true;
      const payload = {
        sources: dto.sources ?? ['sodimac', 'easy'], categories: dto.categories ?? ['ceramic', 'laminate'],
        limit_per_category: dto.limitPerCategory ?? 10,
        ...(scheduledFor ? { scheduled_for: scheduledFor.toISOString() } : {}),
      };
      const capture = await this.python.capture(payload, requestId);
      if (typeof capture !== 'object' || !capture || !('trigger' in capture) || !('scheduled_for' in capture)
        || capture.trigger !== (scheduledFor ? 'scheduled' : 'manual')
        || (scheduledFor ? Date.parse(String(capture.scheduled_for)) !== scheduledFor.getTime() : capture.scheduled_for !== null)
        || !('request_id' in capture) || capture.request_id !== requestId) {
        throw new BadGatewayException('La captura no corresponde a la solicitud iniciada');
      }
      let imported;
      try { imported = await this.materials.importCapture(capture); }
      catch (error) {
        if (error instanceof BadRequestException) throw new BadGatewayException('FastAPI devolvió una captura que no cumple el contrato');
        throw error;
      }
      await this.prisma.captureJob.update({ where: { id }, data: {
        status: imported.status, finishedAt: new Date(), runId: imported.runId,
      } });
      this.log(requestId, imported.status, started);
      return { jobId: id, ...imported };
    } catch (error) {
      if (reserved) {
        const errorCode = error instanceof BadGatewayException ? 'invalid_upstream_response'
          : error instanceof ServiceUnavailableException ? 'upstream_unavailable' : 'capture_or_import_failed';
        await this.prisma.captureJob.update({ where: { id }, data: { status: 'failed', finishedAt: new Date(), errorCode } })
          .catch(() => this.log(requestId, 'job_status_write_failed', started));
        this.log(requestId, errorCode, started);
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('No se pudo completar la captura; se conservan los últimos datos válidos');
    } finally {
      let destroy = false;
      try { if (locked) await client.query('SELECT pg_advisory_unlock($1)', [ACQUISITION_LOCK]); }
      catch { destroy = true; }
      finally { client.release(destroy); }
    }
  }

  private async markInterrupted() {
    // Call only while owning the global acquisition lock: an active worker cannot be overwritten.
    await this.prisma.captureJob.updateMany({ where: { status: 'running' }, data: {
      status: 'failed', finishedAt: new Date(), errorCode: 'interrupted_before_completion',
    } });
  }

  async onApplicationBootstrap() {
    const client = await this.pool.connect();
    let locked = false;
    let destroy = false;
    try {
      locked = (await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked', [ACQUISITION_LOCK])).rows[0]?.locked === true;
      if (locked) await this.markInterrupted();
    } finally {
      try { if (locked) await client.query('SELECT pg_advisory_unlock($1)', [ACQUISITION_LOCK]); }
      catch { destroy = true; }
      client.release(destroy);
    }
  }

  async status() {
    const latest = await this.prisma.captureJob.findFirst({ orderBy: { startedAt: 'desc' } });
    return { scheduleEnabled: process.env.MATERIALS_SCHEDULE_ENABLED === 'true',
      timezone: 'America/Santiago', hours: ['08:00', '12:00', '16:00'], latestJob: latest };
  }

  async onModuleDestroy() { await this.pool.end(); }

  private log(requestId: string, result: string, start: number) {
    console.info(JSON.stringify({ service: 'backend', event: 'capture_job', request_id: requestId,
      result, duration_ms: Math.round((performance.now() - start) * 100) / 100 }));
  }
}
