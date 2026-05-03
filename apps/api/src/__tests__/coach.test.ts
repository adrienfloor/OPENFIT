import { describe, it, expect, vi } from 'vitest';
import type { CoachTopSet, GeneratedProgram, CoachingProfile } from '@openfit/types';
import {
  CoachService,
  CoachError,
  resolveGeneratedProgram,
} from '../services/coach.service.js';
import { WorkoutService } from '../services/workout.service.js';

// ──────────────────────────────────────────────────────────────────────────
// resolveGeneratedProgram — load resolution + metadata stripping
// ──────────────────────────────────────────────────────────────────────────

const baseGenerated: GeneratedProgram = {
  name: 'Test block',
  durationWeeks: 3,
  overview: 'Test program for the resolver.',
  weeks: [
    {
      weekNumber: 1,
      phase: 'accumulation',
      summary: 'Build base.',
      sessions: [
        {
          name: 'Upper A',
          focus: 'Press + back',
          estimatedDurationMinutes: 60,
          exercises: [
            {
              exerciseId: 'ex_bench',
              sets: [
                { reps: 8, loadPctOf1RM: 0.75, rpe: 7, restSeconds: 150 },
                { reps: 8, loadPctOf1RM: 0.75, rpe: 7, restSeconds: 150 },
              ],
              rationale: 'Main press.',
            },
            {
              exerciseId: 'ex_curl',
              sets: [{ reps: 12, rpe: 7, restSeconds: 60 }],
              rationale: 'Biceps with no 1RM history.',
            },
            {
              exerciseId: 'ex_row',
              sets: [{ reps: 10, rpe: 7, restSeconds: 120 }],
              rationale: 'Rowing accessory.',
            },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      phase: 'accumulation',
      summary: 'Push volume.',
      sessions: [
        {
          name: 'Upper A',
          focus: 'Press + back',
          estimatedDurationMinutes: 65,
          exercises: [
            {
              exerciseId: 'ex_bench',
              sets: [{ reps: 8, loadPctOf1RM: 0.78, rpe: 7.5, restSeconds: 150 }],
              rationale: 'Bumped up by 3%.',
            },
            {
              exerciseId: 'ex_curl',
              sets: [{ reps: 12, rpe: 7, restSeconds: 60 }],
              rationale: 'Maintain biceps.',
            },
            {
              exerciseId: 'ex_row',
              sets: [{ reps: 10, rpe: 7.5, restSeconds: 120 }],
              rationale: 'Match pressing.',
            },
          ],
        },
      ],
    },
    {
      weekNumber: 3,
      phase: 'deload',
      summary: 'Recover.',
      sessions: [
        {
          name: 'Full body',
          focus: 'Light deload',
          estimatedDurationMinutes: 40,
          exercises: [
            {
              exerciseId: 'ex_bench',
              sets: [{ reps: 6, loadPctOf1RM: 0.5, rpe: 5, restSeconds: 120 }],
              rationale: 'Half volume.',
            },
            {
              exerciseId: 'ex_curl',
              sets: [{ reps: 10, rpe: 5, restSeconds: 60 }],
              rationale: 'Light arms.',
            },
            {
              exerciseId: 'ex_row',
              sets: [{ reps: 8, rpe: 5, restSeconds: 90 }],
              rationale: 'Light back.',
            },
          ],
        },
      ],
    },
  ],
  assumptions: {
    primaryGoal: 'aesthetics',
    weeklyStrengthSessions: 3,
    cardioLoadConsidered: false,
    deloadStrategy: 'Half volume on week 3.',
  },
};

const topSets: CoachTopSet[] = [
  {
    exerciseId: 'ex_bench',
    exerciseName: 'Bench',
    bestReps: 5,
    bestWeightKg: 100,
    estimated1RMKg: 116.67,
  },
];

describe('resolveGeneratedProgram', () => {
  it('resolves loadPctOf1RM into kg using the user 1RM, rounded to 2.5', () => {
    const out = resolveGeneratedProgram(baseGenerated, topSets);
    const set = out.weeks[0]?.sessions[0]?.exercises[0]?.sets[0];
    // 116.67 × 0.75 = 87.5025 → rounded to 87.5
    expect(set?.weight).toBe(87.5);
    expect(set?.reps).toBe(8);
    expect(set?.rpe).toBe(7);
  });

  it('omits weight when no 1RM is known for an exercise', () => {
    const out = resolveGeneratedProgram(baseGenerated, topSets);
    const set = out.weeks[0]?.sessions[0]?.exercises[1]?.sets[0];
    expect(set?.weight).toBeUndefined();
    expect(set?.rpe).toBe(7);
  });

  it('strips coach metadata (rationale/phase/summary) from the persisted shape', () => {
    const out = resolveGeneratedProgram(baseGenerated, topSets);
    const session = out.weeks[0]?.sessions[0];
    expect(session?.name).toBe('Upper A — Press + back');
    expect(session && 'phase' in session).toBe(false);
    const ex = session?.exercises[0];
    expect(ex && 'rationale' in ex).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CoachService.gatherPromptInput — pure data assembly with mock Prisma
// ──────────────────────────────────────────────────────────────────────────

function makeCoachingProfile(overrides: Partial<CoachingProfile> = {}): CoachingProfile {
  return {
    goal: 'aesthetics',
    experience: 'intermediate',
    gymSessionsPerWeek: 4,
    sessionDurationMinutes: 60,
    availableEquipment: ['barbell', 'dumbbell'],
    emphasis: [],
    secondarySports: [],
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    user: { findUnique: vi.fn(), update: vi.fn() },
    workoutLog: { findMany: vi.fn(), count: vi.fn() },
    dailyHealth: { findMany: vi.fn() },
    completedSet: { findMany: vi.fn() },
    exercise: { findMany: vi.fn() },
    program: { findFirst: vi.fn() },
    programGeneration: { create: vi.fn(), findUnique: vi.fn() },
  };
}

function createMockAnthropic(toolInput: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_01',
            name: 'submit_program',
            input: toolInput,
          },
        ],
      }),
    },
  };
}

describe('CoachService.gatherPromptInput', () => {
  it('assembles a CoachPromptInput from DB state', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
    });
    prisma.workoutLog.findMany
      .mockResolvedValueOnce([
        {
          exerciseLogs: [
            { completedSets: [{ rpe: 7 }, { rpe: 8 }] },
          ],
        },
      ])
      .mockResolvedValueOnce([{ distanceMeters: 5000 }, { distanceMeters: 7000 }]);
    prisma.workoutLog.count.mockResolvedValue(3);
    prisma.dailyHealth.findMany.mockResolvedValue([
      { recoveryScore: 70, effortEarnedMinutes: 35 },
      { recoveryScore: 65, effortEarnedMinutes: null },
    ]);
    prisma.completedSet.findMany.mockResolvedValue([]);
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'ex_bench', name: 'Bench', muscleGroups: ['chest'], equipment: 'barbell' },
    ]);

    const service = new CoachService({
      prisma: prisma as never,
      anthropic: { messages: { create: vi.fn() } },
      workouts: new WorkoutService(prisma as never),
    });

    const input = await service.gatherPromptInput('user_01', makeCoachingProfile());

    // The library query must filter to the profile's equipment whitelist
    // so the LLM can't reach for cable / machine exercises the user can't do.
    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { equipment: { in: ['barbell', 'dumbbell'] } },
      }),
    );

    expect(input.user.weightKg).toBe(80);
    expect(input.user.sex).toBe('male');
    expect(input.user.ageYears).toBeGreaterThan(30);
    expect(input.recent.strengthSessionsLast30d).toBe(1);
    expect(input.recent.runKmLast30d).toBeCloseTo(12, 1);
    expect(input.recent.runSessionsLast30d).toBe(2);
    expect(input.recent.freeSessionsLast30d).toBe(3);
    expect(input.recent.avgReadiness7d).toBeCloseTo(67.5, 1);
    expect(input.recent.avgRpeLast30d).toBeCloseTo(7.5, 1);
    expect(input.exerciseLibrary).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CoachService.generateProgram — Anthropic call mocked end-to-end
// ──────────────────────────────────────────────────────────────────────────

describe('CoachService.generateProgram', () => {
  it('persists Program + ProgramGeneration on a valid LLM response', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
    });
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(0);
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    prisma.completedSet.findMany.mockResolvedValue([]);
    prisma.exercise.findMany
      // gather call
      .mockResolvedValueOnce([
        { id: 'ex_bench', name: 'Bench', muscleGroups: ['chest'], equipment: 'barbell' },
        { id: 'ex_row', name: 'Row', muscleGroups: ['back'], equipment: 'barbell' },
        { id: 'ex_curl', name: 'Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
      ])
      // workouts.createProgram exercise validation call
      .mockResolvedValueOnce([
        { id: 'ex_bench' },
        { id: 'ex_row' },
        { id: 'ex_curl' },
      ]);
    prisma.program = { create: vi.fn().mockResolvedValue({ id: 'prog_new' }) } as never;
    prisma.programGeneration.create.mockResolvedValue({});

    const anthropic = createMockAnthropic(baseGenerated);

    const service = new CoachService({
      prisma: prisma as never,
      anthropic,
      workouts: new WorkoutService(prisma as never),
    });

    const result = await service.generateProgram('user_01', makeCoachingProfile());

    expect(result.programId).toBe('prog_new');
    expect(anthropic.messages.create).toHaveBeenCalledOnce();
    expect(prisma.programGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          programId: 'prog_new',
          userId: 'user_01',
          model: expect.any(String),
        }),
      }),
    );
  });

  it('retries once on Zod validation failure, then succeeds', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
    });
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(0);
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    prisma.completedSet.findMany.mockResolvedValue([]);
    prisma.exercise.findMany
      .mockResolvedValueOnce([
        { id: 'ex_bench', name: 'Bench', muscleGroups: ['chest'], equipment: 'barbell' },
        { id: 'ex_row', name: 'Row', muscleGroups: ['back'], equipment: 'barbell' },
        { id: 'ex_curl', name: 'Curl', muscleGroups: ['biceps'], equipment: 'dumbbell' },
      ])
      .mockResolvedValueOnce([
        { id: 'ex_bench' },
        { id: 'ex_row' },
        { id: 'ex_curl' },
      ]);
    prisma.program = { create: vi.fn().mockResolvedValue({ id: 'prog_new' }) } as never;
    prisma.programGeneration.create.mockResolvedValue({});

    const anthropic = {
      messages: {
        create: vi
          .fn()
          // First call: missing required field
          .mockResolvedValueOnce({
            content: [
              { type: 'tool_use', id: 'toolu_a', name: 'submit_program', input: { name: 'oops' } },
            ],
          })
          // Second call: valid
          .mockResolvedValueOnce({
            content: [
              { type: 'tool_use', id: 'toolu_b', name: 'submit_program', input: baseGenerated },
            ],
          }),
      },
    };

    const service = new CoachService({
      prisma: prisma as never,
      anthropic,
      workouts: new WorkoutService(prisma as never),
    });

    const result = await service.generateProgram('user_01', makeCoachingProfile());
    expect(result.programId).toBe('prog_new');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });

  it('throws CoachError(422) after a second validation failure', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-02-22'),
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
    });
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.workoutLog.count.mockResolvedValue(0);
    prisma.dailyHealth.findMany.mockResolvedValue([]);
    prisma.completedSet.findMany.mockResolvedValue([]);
    prisma.exercise.findMany.mockResolvedValue([
      { id: 'ex_bench', name: 'Bench', muscleGroups: ['chest'], equipment: 'barbell' },
    ]);

    const anthropic = createMockAnthropic({ name: 'still bad' });

    const service = new CoachService({
      prisma: prisma as never,
      anthropic,
      workouts: new WorkoutService(prisma as never),
    });

    await expect(service.generateProgram('user_01', makeCoachingProfile())).rejects.toMatchObject({
      name: 'CoachError',
      statusCode: 422,
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CoachService.adjustSessionForToday — wraps the rule engine + storage lookup
// ──────────────────────────────────────────────────────────────────────────

describe('CoachService.adjustSessionForToday', () => {
  it('loads the stored generation and applies phase-aware adjustment', async () => {
    const prisma = createMockPrisma();
    prisma.programGeneration.findUnique.mockResolvedValue({
      programId: 'prog_01',
      userId: 'user_01',
      generated: baseGenerated,
    });

    const service = new CoachService({
      prisma: prisma as never,
      anthropic: { messages: { create: vi.fn() } },
      workouts: new WorkoutService(prisma as never),
    });

    const result = await service.adjustSessionForToday('user_01', 'prog_01', 1, 0, {
      readiness: 30,
      phase: 'accumulation',
      recentLoad: 100,
    });

    expect(result.volumeMultiplier).toBe(0.7);
    expect(result.reason).toMatch(/low readiness/i);
  });

  it('rejects access by another user', async () => {
    const prisma = createMockPrisma();
    prisma.programGeneration.findUnique.mockResolvedValue({
      programId: 'prog_01',
      userId: 'someone_else',
      generated: baseGenerated,
    });

    const service = new CoachService({
      prisma: prisma as never,
      anthropic: { messages: { create: vi.fn() } },
      workouts: new WorkoutService(prisma as never),
    });

    await expect(
      service.adjustSessionForToday('user_01', 'prog_01', 1, 0, {
        readiness: 70,
        phase: 'accumulation',
        recentLoad: 50,
      }),
    ).rejects.toBeInstanceOf(CoachError);
  });
});
