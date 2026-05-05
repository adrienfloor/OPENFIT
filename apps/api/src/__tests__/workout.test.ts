import { describe, it, expect, vi } from 'vitest';
import { WorkoutService, WorkoutError } from '../services/workout.service.js';

const mockExercise = {
  id: 'ex_01',
  name: 'Bench Press',
  muscleGroups: ['chest'],
  equipment: 'barbell',
};

const mockProgram = {
  id: 'prog_01',
  userId: 'user_01',
  name: 'Push Pull Legs',
  weeks: [],
};

const mockWorkoutLog = {
  id: 'wl_01',
  userId: 'user_01',
  sessionId: null,
  startedAt: new Date(),
  completedAt: new Date(),
  exerciseLogs: [],
  heartRateSamples: [],
  session: null,
};

function createMockPrisma() {
  return {
    exercise: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    program: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
    plannedExercise: {
      updateMany: vi.fn(),
    },
    workoutLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

// --- Programs ---

describe('WorkoutService.getProgramsForUser', () => {
  it('returns programs scoped to userId', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findMany.mockResolvedValue([mockProgram]);

    const result = await service.getProgramsForUser('user_01');

    expect(result).toEqual([mockProgram]);
    expect(prisma.program.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_01' } }),
    );
  });
});

describe('WorkoutService.getProgramById', () => {
  it('returns program when it belongs to user', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(mockProgram);

    const result = await service.getProgramById('user_01', 'prog_01');

    expect(result.id).toBe('prog_01');
    expect(prisma.program.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prog_01', userId: 'user_01' } }),
    );
  });

  it('throws 404 when program not found', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(null);

    await expect(service.getProgramById('user_01', 'nonexistent')).rejects.toThrow(WorkoutError);
    await expect(service.getProgramById('user_01', 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('WorkoutService.createProgram', () => {
  it('creates a program with nested weeks, sessions, exercises, and sets', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.exercise.findMany.mockResolvedValue([{ id: 'ex_01' }]);
    prisma.program.create.mockResolvedValue({
      ...mockProgram,
      weeks: [
        {
          weekNumber: 1,
          sessions: [
            {
              name: 'Push Day',
              plannedExercises: [
                {
                  exerciseId: 'ex_01',
                  exercise: mockExercise,
                  orderIndex: 0,
                  sets: [{ setIndex: 0, reps: 8, weight: 60, rpe: null, restSeconds: 90 }],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = await service.createProgram('user_01', {
      name: 'Push Pull Legs',
      weeks: [
        {
          weekNumber: 1,
          sessions: [
            {
              name: 'Push Day',
              exercises: [
                {
                  exerciseId: 'ex_01',
                  sets: [{ reps: 8, weight: 60, restSeconds: 90 }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.name).toBe('Push Pull Legs');
    expect(prisma.program.create).toHaveBeenCalledOnce();
  });

  it('throws 400 when exercise does not exist', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.exercise.findMany.mockResolvedValue([]);

    await expect(
      service.createProgram('user_01', {
        name: 'Bad Program',
        weeks: [
          {
            weekNumber: 1,
            sessions: [
              {
                name: 'Day 1',
                exercises: [
                  {
                    exerciseId: 'nonexistent',
                    sets: [{ reps: 10, restSeconds: 60 }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('WorkoutService.updateProgram', () => {
  it('updates program name', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(mockProgram);
    prisma.program.update.mockResolvedValue({ ...mockProgram, name: 'Updated Name' });

    const result = await service.updateProgram('user_01', 'prog_01', { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
  });

  it('throws 404 for another user\'s program', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(null);

    await expect(
      service.updateProgram('user_02', 'prog_01', { name: 'Hacked' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('WorkoutService.deleteProgram', () => {
  it('deletes program belonging to user', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(mockProgram);
    prisma.program.delete.mockResolvedValue(mockProgram);

    await expect(service.deleteProgram('user_01', 'prog_01')).resolves.toBeUndefined();
    expect(prisma.program.delete).toHaveBeenCalledWith({ where: { id: 'prog_01' } });
  });

  it('throws 404 for non-existent program', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(null);

    await expect(service.deleteProgram('user_01', 'nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// --- Workout Logs ---

describe('WorkoutService.getLogsForUser', () => {
  it('returns logs scoped to userId', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.workoutLog.findMany.mockResolvedValue([mockWorkoutLog]);

    const result = await service.getLogsForUser('user_01');

    expect(result).toEqual([mockWorkoutLog]);
    expect(prisma.workoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_01' } }),
    );
  });
});

describe('WorkoutService.createWorkoutLog', () => {
  it('creates a workout log with exercise logs and completed sets', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.exercise.findMany.mockResolvedValue([{ id: 'ex_01' }]);
    prisma.workoutLog.create.mockResolvedValue({
      ...mockWorkoutLog,
      exerciseLogs: [
        {
          exerciseId: 'ex_01',
          exercise: mockExercise,
          completedSets: [{ setIndex: 0, reps: 8, weight: 60, rpe: 7, restTaken: 90 }],
        },
      ],
    });

    const result = await service.createWorkoutLog('user_01', {
      type: 'strength',
      source: 'manual',
      startedAt: new Date(),
      completedAt: new Date(),
      exerciseLogs: [
        {
          exerciseId: 'ex_01',
          sets: [{ setIndex: 0, reps: 8, weight: 60, rpe: 7, restTaken: 90 }],
        },
      ],
    });

    expect((result as Record<string, unknown>)['exerciseLogs']).toHaveLength(1);
    expect(prisma.workoutLog.create).toHaveBeenCalledOnce();
  });

  it('throws 400 when exercise does not exist', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.exercise.findMany.mockResolvedValue([]);

    await expect(
      service.createWorkoutLog('user_01', {
        type: 'strength',
        source: 'manual',
        startedAt: new Date(),
        exerciseLogs: [
          {
            exerciseId: 'nonexistent',
            sets: [{ setIndex: 0, reps: 10, weight: 50, restTaken: 60 }],
          },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 409 when an HC import with the same externalId already exists', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.workoutLog.findFirst.mockResolvedValue({ id: 'wl_existing' });

    await expect(
      service.createWorkoutLog('user_01', {
        type: 'run',
        source: 'health_connect',
        externalId: 'hc_session_xyz',
        dataOrigin: 'com.garmin.android.apps.connectmobile',
        startedAt: new Date(),
        completedAt: new Date(),
        exerciseLogs: [],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // No exercise lookup, no row creation when the dedup short-circuits.
    expect(prisma.exercise.findMany).not.toHaveBeenCalled();
    expect(prisma.workoutLog.create).not.toHaveBeenCalled();
  });

  it('persists source / externalId / dataOrigin on a fresh HC import', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.workoutLog.findFirst.mockResolvedValue(null);
    prisma.workoutLog.findMany.mockResolvedValue([]);
    prisma.exercise.findMany.mockResolvedValue([]);
    prisma.workoutLog.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...mockWorkoutLog,
      ...args.data,
    }));

    const start = new Date('2026-05-05T08:00:00Z');
    const end = new Date('2026-05-05T08:30:00Z');

    await service.createWorkoutLog('user_01', {
      type: 'run',
      source: 'health_connect',
      externalId: 'hc_session_xyz',
      dataOrigin: 'com.garmin.android.apps.connectmobile',
      startedAt: start,
      completedAt: end,
      durationSeconds: 1800,
      distanceMeters: 5000,
      exerciseLogs: [],
    });

    expect(prisma.workoutLog.create).toHaveBeenCalledOnce();
    const data = (prisma.workoutLog.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data['source']).toBe('health_connect');
    expect(data['externalId']).toBe('hc_session_xyz');
    expect(data['dataOrigin']).toBe('com.garmin.android.apps.connectmobile');
  });

  it('merges an HC import into an overlapping manual log instead of creating a duplicate', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    const manualStart = new Date('2026-05-05T08:00:00Z');
    const manualEnd = new Date('2026-05-05T08:30:00Z');
    const manualLog = {
      id: 'wl_manual',
      userId: 'user_01',
      source: 'manual',
      startedAt: manualStart,
      completedAt: manualEnd,
      dataOrigin: null,
      // No HR / GPS yet → both should get backfilled from the import.
      heartRateSamples: [],
      gpsPoints: [],
    };
    const enrichedLog = { ...manualLog, linkedExternalId: 'hc_session_xyz' };

    prisma.workoutLog.findFirst.mockResolvedValue(null); // no externalId / linkedExternalId match
    prisma.workoutLog.findMany.mockResolvedValue([manualLog]);
    prisma.workoutLog.update.mockResolvedValue(enrichedLog);

    // Import lands at 08:05 → 08:28 (well within the manual window).
    const importStart = new Date('2026-05-05T08:05:00Z');
    const importEnd = new Date('2026-05-05T08:28:00Z');

    const result = await service.createWorkoutLog('user_01', {
      type: 'run',
      source: 'health_connect',
      externalId: 'hc_session_xyz',
      dataOrigin: 'com.garmin.android.apps.connectmobile',
      startedAt: importStart,
      completedAt: importEnd,
      durationSeconds: 1380,
      distanceMeters: 4000,
      heartRateSamples: [
        { timestamp: new Date('2026-05-05T08:10:00Z'), bpm: 150, zone: 'cardio' },
      ],
      gpsPoints: [
        {
          lat: 43.3,
          lng: 5.4,
          altitudeMeters: 30,
          timestamp: new Date('2026-05-05T08:11:00Z'),
          speedMps: 3,
        },
      ],
      exerciseLogs: [],
    });

    expect(prisma.workoutLog.update).toHaveBeenCalledOnce();
    expect(prisma.workoutLog.create).not.toHaveBeenCalled();
    const updateArgs = prisma.workoutLog.update.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where.id).toBe('wl_manual');
    expect(updateArgs.data['linkedExternalId']).toBe('hc_session_xyz');
    expect(updateArgs.data['dataOrigin']).toBe('com.garmin.android.apps.connectmobile');
    // HR + GPS got backfilled because the manual log had neither.
    expect(updateArgs.data['heartRateSamples']).toBeDefined();
    expect(updateArgs.data['gpsPoints']).toBeDefined();
    expect(result).toEqual(enrichedLog);
  });

  it('skips merge when overlap is below the 0.5 ratio', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    // Manual log: 08:00–08:10 (10 min). Import: 08:09–08:30 (21 min).
    // Overlap = 1 min. ratio = 1 / 21 = 0.048 → no merge.
    const manualLog = {
      id: 'wl_manual',
      userId: 'user_01',
      source: 'manual',
      startedAt: new Date('2026-05-05T08:00:00Z'),
      completedAt: new Date('2026-05-05T08:10:00Z'),
      dataOrigin: null,
      heartRateSamples: [],
      gpsPoints: [],
    };

    prisma.workoutLog.findFirst.mockResolvedValue(null);
    prisma.workoutLog.findMany.mockResolvedValue([manualLog]);
    prisma.exercise.findMany.mockResolvedValue([]);
    prisma.workoutLog.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...mockWorkoutLog,
      ...args.data,
    }));

    await service.createWorkoutLog('user_01', {
      type: 'run',
      source: 'health_connect',
      externalId: 'hc_session_xyz',
      dataOrigin: 'com.garmin.android.apps.connectmobile',
      startedAt: new Date('2026-05-05T08:09:00Z'),
      completedAt: new Date('2026-05-05T08:30:00Z'),
      durationSeconds: 1260,
      distanceMeters: 4000,
      exerciseLogs: [],
    });

    expect(prisma.workoutLog.update).not.toHaveBeenCalled();
    expect(prisma.workoutLog.create).toHaveBeenCalledOnce();
  });

  it('returns 409 when re-syncing an externalId already absorbed via linkedExternalId', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    // First lookup checks both externalId and linkedExternalId — return
    // the previously-merged manual log on the linkedExternalId branch.
    prisma.workoutLog.findFirst.mockResolvedValue({ id: 'wl_manual_already_linked' });

    await expect(
      service.createWorkoutLog('user_01', {
        type: 'run',
        source: 'health_connect',
        externalId: 'hc_session_xyz',
        dataOrigin: 'com.garmin.android.apps.connectmobile',
        startedAt: new Date(),
        completedAt: new Date(),
        exerciseLogs: [],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.workoutLog.update).not.toHaveBeenCalled();
    expect(prisma.workoutLog.create).not.toHaveBeenCalled();
  });
});

describe('WorkoutService.deleteWorkoutLog', () => {
  it('deletes log belonging to user', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.workoutLog.findFirst.mockResolvedValue(mockWorkoutLog);
    prisma.workoutLog.delete.mockResolvedValue(mockWorkoutLog);

    await expect(service.deleteWorkoutLog('user_01', 'wl_01')).resolves.toBeUndefined();
  });

  it('throws 404 for another user\'s log', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.workoutLog.findFirst.mockResolvedValue(null);

    await expect(service.deleteWorkoutLog('user_02', 'wl_01')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// --- Multi-tenancy ---

describe('Multi-tenancy: workout isolation', () => {
  it('getProgramById enforces userId scope', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(null);

    await expect(service.getProgramById('user_02', 'prog_01')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(prisma.program.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prog_01', userId: 'user_02' } }),
    );
  });

  it('getLogById enforces userId scope', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.workoutLog.findFirst.mockResolvedValue(null);

    await expect(service.getLogById('user_02', 'wl_01')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(prisma.workoutLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wl_01', userId: 'user_02' } }),
    );
  });
});

describe('WorkoutService.swapProgramExercise', () => {
  it('updates the same orderIndex slot across every week of the program', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue({ id: 'prog_01' });
    prisma.exercise.findUnique.mockResolvedValue({ id: 'ex_db_bench' });
    prisma.plannedExercise.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.swapProgramExercise('user_01', 'prog_01', {
      sessionName: 'Day 1 — Push',
      orderIndex: 0,
      newExerciseId: 'ex_db_bench',
    });

    expect(result.updatedCount).toBe(5);
    expect(prisma.plannedExercise.updateMany).toHaveBeenCalledWith({
      where: {
        orderIndex: 0,
        session: {
          name: 'Day 1 — Push',
          week: { programId: 'prog_01' },
        },
      },
      data: { exerciseId: 'ex_db_bench' },
    });
  });

  it('rejects when program belongs to another user', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue(null);

    await expect(
      service.swapProgramExercise('user_02', 'prog_01', {
        sessionName: 'Day 1',
        orderIndex: 0,
        newExerciseId: 'ex_db_bench',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.plannedExercise.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when target exercise does not exist', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.program.findFirst.mockResolvedValue({ id: 'prog_01' });
    prisma.exercise.findUnique.mockResolvedValue(null);

    await expect(
      service.swapProgramExercise('user_01', 'prog_01', {
        sessionName: 'Day 1',
        orderIndex: 0,
        newExerciseId: 'ex_does_not_exist',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.plannedExercise.updateMany).not.toHaveBeenCalled();
  });
});
