import { CapturesScheduler, scheduledSlot } from './captures.scheduler.js';
import { CapturesService } from './captures.service.js';

describe('Chile schedule', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([
    ['2026-01-05T11:00:00Z', '2026-01-05T11:00:00.000Z'],
    ['2026-07-05T12:14:59Z', '2026-07-05T12:00:00.000Z'],
    ['2026-01-05T15:02:00Z', '2026-01-05T15:00:00.000Z'],
    ['2026-07-05T20:00:00Z', '2026-07-05T20:00:00.000Z'],
    ['2026-07-05T11:00:00Z', null],
    ['2026-01-05T11:15:00Z', null],
    ['2026-01-05T20:00:00Z', null],
  ])('targets 08/12/16 with DST and bounded startup window: %s', (date, expected) => {
    expect(scheduledSlot(new Date(date))?.toISOString() ?? null).toBe(expected);
  });

  it('is disabled by default and does not start retailer reads', () => {
    vi.stubEnv('MATERIALS_SCHEDULE_ENABLED', 'false');
    const run = vi.fn();
    const scheduler = new CapturesScheduler({ run } as unknown as CapturesService);
    scheduler.onApplicationBootstrap();
    expect(run).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('requires credentials when explicitly enabled', () => {
    vi.stubEnv('MATERIALS_SCHEDULE_ENABLED', 'true');
    vi.stubEnv('MATERIALS_API_TOKEN', '');
    const scheduler = new CapturesScheduler({} as CapturesService);
    expect(() => scheduler.onApplicationBootstrap()).toThrow('MATERIALS_API_TOKEN');
  });

  it('delegates each slot to durable exclusion and handles source errors without crashing', async () => {
    const run = vi.fn().mockRejectedValue(new Error('source unavailable'));
    const scheduler = new CapturesScheduler({ run } as unknown as CapturesService);
    await expect(scheduler.tick(new Date('2026-01-05T11:05:00Z'))).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledWith({}, undefined, new Date('2026-01-05T11:00:00Z'));
    await scheduler.tick(new Date('2026-01-05T20:00:00Z'));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
