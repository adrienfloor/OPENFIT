import type { PrismaClient } from '@prisma/client';
import type {
  CreateProgramInput,
  UpdateProgramInput,
  CreateWorkoutLogInput,
  UpdateWorkoutLogInput,
  WorkoutType,
} from '@openfit/types';

export class WorkoutError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'WorkoutError';
  }
}

export class WorkoutService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Programs ---

  async getProgramsForUser(userId: string) {
    return this.prisma.program.findMany({
      where: { userId },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            sessions: {
              include: {
                plannedExercises: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    exercise: true,
                    sets: { orderBy: { setIndex: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getProgramById(userId: string, programId: string) {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, userId },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            sessions: {
              include: {
                plannedExercises: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    exercise: true,
                    sets: { orderBy: { setIndex: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!program) {
      throw new WorkoutError('Program not found', 404);
    }

    return program;
  }

  async createProgram(userId: string, input: CreateProgramInput) {
    // Validate all referenced exercises exist
    const exerciseIds = new Set<string>();
    for (const week of input.weeks) {
      for (const session of week.sessions) {
        for (const exercise of session.exercises) {
          exerciseIds.add(exercise.exerciseId);
        }
      }
    }

    if (exerciseIds.size > 0) {
      const found = await this.prisma.exercise.findMany({
        where: { id: { in: [...exerciseIds] } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((e) => e.id));
      const missing = [...exerciseIds].filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new WorkoutError(`Exercises not found: ${missing.join(', ')}`, 400);
      }
    }

    return this.prisma.program.create({
      data: {
        userId,
        name: input.name,
        weeks: {
          create: input.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            sessions: {
              create: week.sessions.map((session) => ({
                name: session.name,
                plannedExercises: {
                  create: session.exercises.map((pe, idx) => ({
                    exerciseId: pe.exerciseId,
                    orderIndex: idx,
                    sets: {
                      create: pe.sets.map((set, setIdx) => ({
                        setIndex: setIdx,
                        reps: set.reps,
                        weight: set.weight ?? null,
                        rpe: set.rpe ?? null,
                        restSeconds: set.restSeconds,
                      })),
                    },
                  })),
                },
              })),
            },
          })),
        },
      },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            sessions: {
              include: {
                plannedExercises: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    exercise: true,
                    sets: { orderBy: { setIndex: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async updateProgram(userId: string, programId: string, input: UpdateProgramInput) {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, userId },
    });

    if (!program) {
      throw new WorkoutError('Program not found', 404);
    }

    return this.prisma.program.update({
      where: { id: programId },
      data: { ...(input.name !== undefined ? { name: input.name } : {}) },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            sessions: {
              include: {
                plannedExercises: {
                  orderBy: { orderIndex: 'asc' },
                  include: {
                    exercise: true,
                    sets: { orderBy: { setIndex: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async deleteProgram(userId: string, programId: string) {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, userId },
    });

    if (!program) {
      throw new WorkoutError('Program not found', 404);
    }

    await this.prisma.program.delete({ where: { id: programId } });
  }

  // --- Exercises ---

  async getExercises() {
    return this.prisma.exercise.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // --- Workout Logs ---

  async getLogsForUser(userId: string, limit = 50, type?: WorkoutType) {
    return this.prisma.workoutLog.findMany({
      where: { userId, ...(type ? { type } : {}) },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        session: true,
        exerciseLogs: {
          include: {
            exercise: true,
            completedSets: { orderBy: { setIndex: 'asc' } },
          },
        },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
        gpsPoints: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async getLogById(userId: string, logId: string) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id: logId, userId },
      include: {
        session: true,
        exerciseLogs: {
          include: {
            exercise: true,
            completedSets: { orderBy: { setIndex: 'asc' } },
          },
        },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
        gpsPoints: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!log) {
      throw new WorkoutError('Workout log not found', 404);
    }

    return log;
  }

  async createWorkoutLog(userId: string, input: CreateWorkoutLogInput) {
    // Validate session belongs to user if provided
    if (input.sessionId) {
      const session = await this.prisma.session.findFirst({
        where: {
          id: input.sessionId,
          week: { program: { userId } },
        },
      });
      if (!session) {
        throw new WorkoutError('Session not found', 404);
      }
    }

    // Validate all referenced exercises exist
    const exerciseIds = input.exerciseLogs.map((el) => el.exerciseId);
    if (exerciseIds.length > 0) {
      const found = await this.prisma.exercise.findMany({
        where: { id: { in: exerciseIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((e) => e.id));
      const missing = exerciseIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new WorkoutError(`Exercises not found: ${missing.join(', ')}`, 400);
      }
    }

    const data: Parameters<typeof this.prisma.workoutLog.create>[0]['data'] = {
      userId,
      type: input.type,
      sessionId: input.sessionId ?? null,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? null,
      caloriesBurned: input.caloriesBurned ?? null,
      distanceMeters: input.distanceMeters ?? null,
      durationSeconds: input.durationSeconds ?? null,
      avgPaceSecondsPerKm: input.avgPaceSecondsPerKm ?? null,
      bestPaceSecondsPerKm: input.bestPaceSecondsPerKm ?? null,
      elevationGainMeters: input.elevationGainMeters ?? null,
      exerciseLogs: {
        create: input.exerciseLogs.map((el) => ({
          exerciseId: el.exerciseId,
          completedSets: {
            create: el.sets.map((set) => ({
              setIndex: set.setIndex,
              reps: set.reps,
              weight: set.weight,
              rpe: set.rpe ?? null,
              restTaken: set.restTaken,
              heartRateAtCompletion: set.heartRateAtCompletion ?? null,
            })),
          },
        })),
      },
    };

    if (input.heartRateSamples && input.heartRateSamples.length > 0) {
      data.heartRateSamples = {
        create: input.heartRateSamples.map((sample) => ({
          timestamp: sample.timestamp,
          bpm: sample.bpm,
          zone: sample.zone,
        })),
      };
    }

    if (input.gpsPoints && input.gpsPoints.length > 0) {
      data.gpsPoints = {
        create: input.gpsPoints.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          altitudeMeters: p.altitudeMeters,
          timestamp: p.timestamp,
          speedMps: p.speedMps,
        })),
      };
    }

    return this.prisma.workoutLog.create({
      data,
      include: {
        session: true,
        exerciseLogs: {
          include: {
            exercise: true,
            completedSets: { orderBy: { setIndex: 'asc' } },
          },
        },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
        gpsPoints: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async updateWorkoutLog(userId: string, logId: string, input: UpdateWorkoutLogInput) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id: logId, userId },
    });

    if (!log) {
      throw new WorkoutError('Workout log not found', 404);
    }

    return this.prisma.workoutLog.update({
      where: { id: logId },
      data: {
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        ...(input.caloriesBurned !== undefined ? { caloriesBurned: input.caloriesBurned } : {}),
        ...(input.distanceMeters !== undefined ? { distanceMeters: input.distanceMeters } : {}),
        ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.avgPaceSecondsPerKm !== undefined ? { avgPaceSecondsPerKm: input.avgPaceSecondsPerKm } : {}),
        ...(input.bestPaceSecondsPerKm !== undefined ? { bestPaceSecondsPerKm: input.bestPaceSecondsPerKm } : {}),
        ...(input.elevationGainMeters !== undefined ? { elevationGainMeters: input.elevationGainMeters } : {}),
      },
      include: {
        session: true,
        exerciseLogs: {
          include: {
            exercise: true,
            completedSets: { orderBy: { setIndex: 'asc' } },
          },
        },
        heartRateSamples: { orderBy: { timestamp: 'asc' } },
        gpsPoints: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  async deleteWorkoutLog(userId: string, logId: string) {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id: logId, userId },
    });

    if (!log) {
      throw new WorkoutError('Workout log not found', 404);
    }

    await this.prisma.workoutLog.delete({ where: { id: logId } });
  }
}
