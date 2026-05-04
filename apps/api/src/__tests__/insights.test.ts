import { describe, it, expect, vi } from 'vitest';
import { InsightsService, InsightsError } from '../services/insights.service.js';

function makePrisma() {
  return {
    user: { findUnique: vi.fn() },
    workoutLog: { findFirst: vi.fn() },
    dailyHealth: { findFirst: vi.fn(), findMany: vi.fn() },
    insight: { findUnique: vi.fn(), create: vi.fn() },
  };
}

const goodToolInput = {
  headline: 'Recovered well — go push it today',
  body: 'HRV 71 vs baseline 67 and sleep score 79 set you up for a hard session. Aim high on the main lifts and bank one easy day before the next deload.',
  inputs: ['Sleep score 79', 'HRV 71 ms (baseline 67)', '3-day load 124 min'],
};

function makeAnthropic(payload: unknown = goodToolInput) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_01', name: 'submit_insight', input: payload },
        ],
        usage: { input_tokens: 200, output_tokens: 80 },
      }),
    },
  };
}

const baseUser = {
  name: 'Bob Lifter',
  dateOfBirth: new Date('1990-02-22'),
  sex: 'male' as const,
};

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('InsightsService.getOrCreate', () => {
  it('generates and persists a fresh insight on cache miss', async () => {
    const prisma = makePrisma();
    const anthropic = makeAnthropic();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.workoutLog.findFirst.mockResolvedValue({
      type: 'run',
      completedAt: new Date('2026-05-04T08:00:00Z'),
      durationSeconds: 2400,
    });
    prisma.dailyHealth.findFirst.mockResolvedValue({
      updatedAt: new Date('2026-05-04T07:30:00Z'),
    });
    prisma.dailyHealth.findMany.mockResolvedValue([
      { date: new Date('2026-05-04'), sleepScore: 79, sleepDurationMinutes: 470, recoveryScore: 76, effortScore: 80, effortEarnedMinutes: 90, heartRateResting: 47, hrvRmssd: 71 },
      { date: new Date('2026-05-03'), sleepScore: 75, sleepDurationMinutes: 460, recoveryScore: 70, effortScore: 65, effortEarnedMinutes: 60, heartRateResting: 48, hrvRmssd: 67 },
      { date: new Date('2026-05-02'), sleepScore: 70, sleepDurationMinutes: 440, recoveryScore: 68, effortScore: 50, effortEarnedMinutes: 30, heartRateResting: 49, hrvRmssd: 65 },
      { date: new Date('2026-05-01'), sleepScore: 72, sleepDurationMinutes: 450, recoveryScore: 72, effortScore: 55, effortEarnedMinutes: 40, heartRateResting: 49, hrvRmssd: 66 },
    ]);
    prisma.insight.findUnique.mockResolvedValue(null);
    prisma.insight.create.mockResolvedValue({});

    const service = new InsightsService({
      prisma: prisma as never,
      anthropic,
      logger: silentLogger(),
      now: () => new Date('2026-05-04T10:00:00Z'),
    });

    const out = await service.getOrCreate('user_bob', 'general');
    expect(out.headline).toContain('Recovered');
    // Window is derived from server-side `now`, not the model. Don't pin
    // it to a specific value (TZ-dependent), just assert it's set.
    expect(['morning', 'afternoon', 'evening']).toContain(out.window);
    expect(prisma.insight.create).toHaveBeenCalledTimes(1);
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('returns the cached insight when the event stamp has not advanced', async () => {
    const prisma = makePrisma();
    const anthropic = makeAnthropic();
    const stamp = new Date('2026-05-04T07:30:00Z');
    prisma.workoutLog.findFirst.mockResolvedValue({ completedAt: stamp });
    prisma.dailyHealth.findFirst.mockResolvedValue({ updatedAt: new Date('2026-05-04T07:00:00Z') });
    prisma.insight.findUnique.mockResolvedValue({
      id: 'cached_01',
      output: {
        headline: 'Cached headline',
        body: 'Cached body line.',
        inputs: ['a', 'b'],
        window: 'morning',
        generatedAt: '2026-05-04T08:00:00.000Z',
      },
    });

    const service = new InsightsService({
      prisma: prisma as never,
      anthropic,
      logger: silentLogger(),
      now: () => new Date('2026-05-04T10:00:00Z'),
    });

    const out = await service.getOrCreate('user_bob', 'general');
    expect(out.headline).toBe('Cached headline');
    expect(anthropic.messages.create).not.toHaveBeenCalled();
    expect(prisma.insight.create).not.toHaveBeenCalled();
  });

  it('regenerates after the event stamp advances (workout finished mid-day)', async () => {
    const prisma = makePrisma();
    const anthropic = makeAnthropic();
    prisma.user.findUnique.mockResolvedValue(baseUser);

    // Newer event stamp than what any cached row would have.
    prisma.workoutLog.findFirst.mockResolvedValue({
      type: 'strength',
      completedAt: new Date('2026-05-04T11:30:00Z'),
      durationSeconds: 3600,
    });
    prisma.dailyHealth.findFirst.mockResolvedValue({
      updatedAt: new Date('2026-05-04T07:30:00Z'),
    });
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    // Cache lookup keyed on 11:30 stamp returns null because the cached
    // row used the old 07:30 stamp.
    prisma.insight.findUnique.mockResolvedValue(null);
    prisma.insight.create.mockResolvedValue({});

    const service = new InsightsService({
      prisma: prisma as never,
      anthropic,
      logger: silentLogger(),
      now: () => new Date('2026-05-04T12:00:00Z'),
    });

    await service.getOrCreate('user_bob', 'general');

    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
    const createCall = prisma.insight.create.mock.calls[0]![0]!.data;
    expect(createCall.lastEventStamp).toEqual(new Date('2026-05-04T11:30:00Z'));
    expect(createCall.dateBucket).toBe('2026-05-04');
    expect(createCall.focus).toBe('general');
  });

  it('rejects unknown focus values', async () => {
    const prisma = makePrisma();
    const service = new InsightsService({
      prisma: prisma as never,
      anthropic: makeAnthropic(),
      logger: silentLogger(),
    });
    await expect(service.getOrCreate('user_bob', 'nonsense')).rejects.toThrowError(
      InsightsError,
    );
  });

  it('retries once when the LLM returns invalid output, then succeeds', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.workoutLog.findFirst.mockResolvedValue({ completedAt: new Date('2026-05-04T08:00:00Z') });
    prisma.dailyHealth.findFirst.mockResolvedValue({ updatedAt: new Date('2026-05-04T07:30:00Z') });
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    prisma.insight.findUnique.mockResolvedValue(null);
    prisma.insight.create.mockResolvedValue({});

    // First call: missing required body. Second call: valid.
    const create = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'toolu_01', name: 'submit_insight', input: { headline: 'x', inputs: ['a', 'b'] } }],
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'toolu_02', name: 'submit_insight', input: goodToolInput }],
        usage: { input_tokens: 110, output_tokens: 60 },
      });

    const service = new InsightsService({
      prisma: prisma as never,
      anthropic: { messages: { create } } as never,
      logger: silentLogger(),
      now: () => new Date('2026-05-04T10:00:00Z'),
    });

    const out = await service.getOrCreate('user_bob', 'general');
    expect(out.headline).toBe(goodToolInput.headline);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws after the retry also fails validation', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.workoutLog.findFirst.mockResolvedValue({ completedAt: new Date('2026-05-04T08:00:00Z') });
    prisma.dailyHealth.findFirst.mockResolvedValue({ updatedAt: new Date('2026-05-04T07:30:00Z') });
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    prisma.insight.findUnique.mockResolvedValue(null);

    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_x', name: 'submit_insight', input: { headline: '', inputs: [] } }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const service = new InsightsService({
      prisma: prisma as never,
      anthropic: { messages: { create } } as never,
      logger: silentLogger(),
      now: () => new Date('2026-05-04T10:00:00Z'),
    });

    await expect(service.getOrCreate('user_bob', 'general')).rejects.toThrowError(
      InsightsError,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('multi-tenancy: cache lookup is scoped to the requesting user', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.workoutLog.findFirst.mockResolvedValue({ completedAt: new Date('2026-05-04T08:00:00Z') });
    prisma.dailyHealth.findFirst.mockResolvedValue({ updatedAt: new Date('2026-05-04T07:30:00Z') });
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    prisma.insight.findUnique.mockResolvedValue(null);
    prisma.insight.create.mockResolvedValue({});

    const service = new InsightsService({
      prisma: prisma as never,
      anthropic: makeAnthropic(),
      logger: silentLogger(),
      now: () => new Date('2026-05-04T10:00:00Z'),
    });

    await service.getOrCreate('user_alice', 'general');

    // Every DB call should carry user_alice's id, never bleed to another user.
    const allCalls = [
      ...prisma.user.findUnique.mock.calls,
      ...prisma.workoutLog.findFirst.mock.calls,
      ...prisma.dailyHealth.findFirst.mock.calls,
      ...prisma.dailyHealth.findMany.mock.calls,
    ];
    for (const call of allCalls) {
      const arg = JSON.stringify(call[0] ?? {});
      expect(arg).toContain('user_alice');
    }
    const findUniqueArg = prisma.insight.findUnique.mock.calls[0]![0]!;
    expect(findUniqueArg.where.userId_focus_dateBucket_lastEventStamp.userId).toBe('user_alice');
  });
});
