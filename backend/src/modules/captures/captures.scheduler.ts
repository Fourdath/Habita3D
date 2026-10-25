import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { CapturesService } from './captures.service.js';
import { materialsTokenConfigured } from './materials-token.guard.js';

const chileTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function scheduledSlot(now: Date): Date | null {
  const parts = Object.fromEntries(chileTime.formatToParts(now).map(p => [p.type, p.value]));
  if (![8, 12, 16].includes(Number(parts.hour)) || Number(parts.minute) >= 15) return null;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
}

@Injectable()
export class CapturesScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly captures: CapturesService) {}

  onApplicationBootstrap() {
    const enabled = process.env.MATERIALS_SCHEDULE_ENABLED ?? 'false';
    if (!['true', 'false'].includes(enabled)) throw new Error('MATERIALS_SCHEDULE_ENABLED debe ser true o false');
    if (enabled !== 'true') return;
    if (!materialsTokenConfigured()) throw new Error('El programador requiere MATERIALS_API_TOKEN válido');
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    this.timer.unref();
  }

  async tick(now = new Date()) {
    const slot = scheduledSlot(now);
    if (!slot) return;
    try { await this.captures.run({}, undefined, slot); }
    catch {
      console.info(JSON.stringify({ service: 'backend', event: 'scheduled_capture', result: 'not_completed', scheduled_for: slot.toISOString() }));
    }
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
