import type { PrismaClient } from '@prisma/client';
import type {
  CreateProgramInput,
  UpdateProgramInput,
  CreateWorkoutLogInput,
  UpdateWorkoutLogInput,
  WorkoutType,
} from '@openfit/types';
import {
  estimateVo2maxFromRun,
  qualifiesForVo2maxEstimate,
} from '@openfit/fitness-core';

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
              // cuid v1 IDs are time-sortable; ordering by id preserves
              // insert order, which matches the GeneratedProgram session
              // index used by /coach/adjust-session.
              orderBy: { id: 'asc' },
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
              // cuid v1 IDs are time-sortable; ordering by id preserves
              // insert order, which matches the GeneratedProgram session
              // index used by /coach/adjust-session.
              orderBy: { id: 'asc' },
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
              // cuid v1 IDs are time-sortable; ordering by id preserves
              // insert order, which matches the GeneratedProgram session
              // index used by /coach/adjust-session.
              orderBy: { id: 'asc' },
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
              // cuid v1 IDs are time-sortable; ordering by id preserves
              // insert order, which matches the GeneratedProgram session
              // index used by /coach/adjust-session.
              orderBy: { id: 'asc' },
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

  /**
   * Replace one exercise slot across every week of a program — i.e. when
   * the user swaps "Bench Press" for "Dumbbell Bench Press" on Day 1, the
   * change carries to Day 1 in every week (past and future) of this program.
   *
   * Sessions across weeks are matched by name (e.g. "Day 1 — Push"); the
   * slot itself is matched by `orderIndex` so multiple instances of the
   * same starting exercise in one session don't collide.
   */
  async swapProgramExercise(
    userId: string,
    programId: string,
    input: { sessionName: string; orderIndex: number; newExerciseId: string },
  ): Promise<{ updatedCount: number }> {
    const program = await this.prisma.program.findFirst({
      where: { id: programId, userId },
      select: { id: true },
    });
    if (!program) throw new WorkoutError('Program not found', 404);

    const newExercise = await this.prisma.exercise.findUnique({
      where: { id: input.newExerciseId },
      select: { id: true },
    });
    if (!newExercise) throw new WorkoutError('Exercise not found', 400);

    const result = await this.prisma.plannedExercise.updateMany({
      where: {
        orderIndex: input.orderIndex,
        session: {
          name: input.sessionName,
          week: { programId },
        },
      },
      data: { exerciseId: input.newExerciseId },
    });

    return { updatedCount: result.count };
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
    // Health Connect imports carry the upstream session UID so re-syncs
    // are idempotent. Same `(userId, externalId)` OR a manual log that
    // already absorbed this externalId via overlap-merge ⇒ already
    // imported. 409 lets the mobile importer swallow the duplicate
    // without fanfare.
    if (input.source === 'health_connect' && input.externalId) {
      const existing = await this.prisma.workoutLog.findFirst({
        where: {
          userId,
          OR: [
            { externalId: input.externalId },
            { linkedExternalId: input.externalId },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        throw new WorkoutError('Workout already imported', 409);
      }

      // Overlap merge: if the user recorded this workout in OpenFit
      // (manual) AND the watch later pushed the same activity into HC,
      // we don't want a duplicate row. Find a manual log whose time
      // window meaningfully overlaps the import (≥50 % of the longer
      // session), enrich it with the import's HR / GPS / dataOrigin,
      // stamp linkedExternalId so the next sync skips, and return.
      const merged = await this.tryMergeIntoOverlappingManualLog(userId, input);
      if (merged) return merged;
    }

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

    // VO₂max estimate — ACSM × HR-fraction, runs only. Strength, free
    // sessions, and short jogs get null; qualifying runs get a stored
    // value that MetricsService later picks the best of from a 28-day
    // window.
    const vo2 = this.deriveVo2maxEstimate(input);

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
      vo2maxEstimate: vo2,
      vo2maxComputedAt: vo2 != null ? new Date() : null,
      source: input.source ?? 'manual',
      externalId: input.externalId ?? null,
      dataOrigin: input.dataOrigin ?? null,
      hcRouteType: input.hcRouteType ?? null,
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

    // GPS points are write-once-replace: lazy-loaded after the user
    // grants per-session HC consent. Wipe and re-insert in a single
    // transaction so a partial write can't leave the row half-routed.
    if (input.gpsPoints !== undefined) {
      const points = input.gpsPoints;
      await this.prisma.$transaction([
        this.prisma.gPSPoint.deleteMany({ where: { workoutLogId: logId } }),
        ...(points.length > 0
          ? [
              this.prisma.gPSPoint.createMany({
                data: points.map((p) => ({
                  workoutLogId: logId,
                  lat: p.lat,
                  lng: p.lng,
                  altitudeMeters: p.altitudeMeters,
                  speedMps: p.speedMps,
                  timestamp: p.timestamp,
                })),
              }),
            ]
          : []),
      ]);
    }

    return this.prisma.workoutLog.update({
      where: { id: logId },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        ...(input.caloriesBurned !== undefined ? { caloriesBurned: input.caloriesBurned } : {}),
        ...(input.distanceMeters !== undefined ? { distanceMeters: input.distanceMeters } : {}),
        ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.avgPaceSecondsPerKm !== undefined ? { avgPaceSecondsPerKm: input.avgPaceSecondsPerKm } : {}),
        ...(input.bestPaceSecondsPerKm !== undefined ? { bestPaceSecondsPerKm: input.bestPaceSecondsPerKm } : {}),
        ...(input.elevationGainMeters !== undefined ? { elevationGainMeters: input.elevationGainMeters } : {}),
        ...(input.hcRouteType !== undefined ? { hcRouteType: input.hcRouteType } : {}),
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

  // Overlap merge for HC imports. When the user records a workout in
  // OpenFit AND the watch later pushes the same activity into HC, we'd
  // otherwise show two rows for the same session. Strategy: find a
  // manual log whose time window meaningfully overlaps the import
  // (≥50 % of the longer session), enrich it with whatever extra HC
  // data the writer provides (HR samples + GPS route, plus dataOrigin
  // for the source badge), stamp `linkedExternalId` so re-syncs of
  // the same upstream session skip via the 409 path. Returns the
  // enriched log on merge, null otherwise.
  //
  // The threshold is intentionally simple: ratio = overlapSeconds /
  // max(durationA, durationB). 0.5 catches "watch session of the same
  // workout" without merging back-to-back sessions that happened to
  // touch.
  private async tryMergeIntoOverlappingManualLog(
    userId: string,
    input: CreateWorkoutLogInput,
  ) {
    const importStart = input.startedAt;
    const importEnd = input.completedAt ?? input.startedAt;
    const importMs = importEnd.getTime() - importStart.getTime();
    if (importMs <= 0) return null;

    // Pull manual logs whose window touches the import. Postgres
    // doesn't have a native interval-overlap index for this access
    // pattern, but the per-user volume is small (≤ a few hundred logs
    // in any practical history) so a simple range scan is fine.
    const candidates = await this.prisma.workoutLog.findMany({
      where: {
        userId,
        source: 'manual',
        // touches the import window: startedAt < importEnd AND completedAt > importStart
        startedAt: { lt: importEnd },
        completedAt: { gt: importStart },
      },
      include: {
        heartRateSamples: { select: { id: true }, take: 1 },
        gpsPoints: { select: { id: true }, take: 1 },
      },
    });

    for (const candidate of candidates) {
      if (!candidate.completedAt) continue;
      const candStart = candidate.startedAt.getTime();
      const candEnd = candidate.completedAt.getTime();
      const candMs = candEnd - candStart;
      if (candMs <= 0) continue;

      const overlapMs =
        Math.min(candEnd, importEnd.getTime()) -
        Math.max(candStart, importStart.getTime());
      if (overlapMs <= 0) continue;

      const ratio = overlapMs / Math.max(candMs, importMs);
      if (ratio < 0.5) continue;

      // Found a merge target. Only attach HR / GPS the manual log is
      // missing — never overwrite what the user's own recording
      // produced (BLE HR device → user trusts those samples; we only
      // backfill).
      const data: Parameters<typeof this.prisma.workoutLog.update>[0]['data'] = {
        linkedExternalId: input.externalId ?? null,
        dataOrigin: input.dataOrigin ?? candidate.dataOrigin,
      };

      const importHR = input.heartRateSamples ?? [];
      if (candidate.heartRateSamples.length === 0 && importHR.length > 0) {
        data.heartRateSamples = {
          create: importHR.map((s) => ({
            timestamp: s.timestamp,
            bpm: s.bpm,
            zone: s.zone,
          })),
        };
      }

      const importGPS = input.gpsPoints ?? [];
      if (candidate.gpsPoints.length === 0 && importGPS.length > 0) {
        data.gpsPoints = {
          create: importGPS.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            altitudeMeters: p.altitudeMeters,
            timestamp: p.timestamp,
            speedMps: p.speedMps,
          })),
        };
      }

      return this.prisma.workoutLog.update({
        where: { id: candidate.id },
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

    return null;
  }

  // Returns the per-workout VO₂max estimate (ml/kg/min) for runs that
  // pass the qualifying gate, else null. Uses ACSM running × HR-fraction
  // (see fitness-core/vo2max.ts for the derivation) — runs only, since
  // non-run activities don't yield an accurate steady-state pace.
  //
  // Peak HR is taken from the workout's own samples, NOT the Tanaka
  // estimate, so the calculation calibrates against what actually
  // happened on the day.
  private deriveVo2maxEstimate(input: CreateWorkoutLogInput): number | null {
    const samples = input.heartRateSamples ?? [];
    if (samples.length === 0) return null;
    if (input.durationSeconds == null) return null;

    const peakHRBpm = Math.max(...samples.map((s) => s.bpm));
    const avgHRBpm = samples.reduce((s, sample) => s + sample.bpm, 0) / samples.length;

    if (
      !qualifiesForVo2maxEstimate({
        type: input.type,
        durationSeconds: input.durationSeconds,
        distanceMeters: input.distanceMeters ?? null,
        avgHRBpm,
        peakHRBpm,
      })
    ) {
      return null;
    }

    return estimateVo2maxFromRun({
      distanceMeters: input.distanceMeters!,
      durationSeconds: input.durationSeconds,
      avgHRBpm,
      peakHRBpm,
    });
  }
}
