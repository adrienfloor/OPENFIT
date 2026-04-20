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
    workoutLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
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
      startedAt: new Date(),
      completedAt: new Date(),
      exerciseLogs: [
        {
          exerciseId: 'ex_01',
          sets: [{ setIndex: 0, reps: 8, weight: 60, rpe: 7, restTaken: 90 }],
        },
      ],
    });

    expect(result.exerciseLogs).toHaveLength(1);
    expect(prisma.workoutLog.create).toHaveBeenCalledOnce();
  });

  it('throws 400 when exercise does not exist', async () => {
    const prisma = createMockPrisma();
    const service = new WorkoutService(prisma as never);

    prisma.exercise.findMany.mockResolvedValue([]);

    await expect(
      service.createWorkoutLog('user_01', {
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
