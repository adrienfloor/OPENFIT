import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Clear existing data in dependency order
  await prisma.heartRateSample.deleteMany();
  await prisma.completedSet.deleteMany();
  await prisma.exerciseLog.deleteMany();
  await prisma.gPSPoint.deleteMany();
  await prisma.runSession.deleteMany();
  await prisma.workoutLog.deleteMany();
  await prisma.plannedSet.deleteMany();
  await prisma.plannedExercise.deleteMany();
  await prisma.session.deleteMany();
  await prisma.week.deleteMany();
  await prisma.program.deleteMany();
  await prisma.dailyHealth.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.exercise.deleteMany();

  // Create test users
  const passwordHash = await bcrypt.hash('Password123', 12);

  const alice = await prisma.user.create({
    data: {
      email: 'alice@openfit.dev',
      passwordHash,
      name: 'Alice Trainer',
      dateOfBirth: new Date('1990-04-15'),
      weightKg: 65,
      role: 'user',
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@openfit.dev',
      passwordHash,
      name: 'Bob Lifter',
      dateOfBirth: new Date('1985-08-22'),
      weightKg: 85,
      role: 'admin',
    },
  });

  console.log(`Created users: ${alice.email}, ${bob.email}`);

  // Seed exercises
  const exercises = await Promise.all([
    prisma.exercise.create({
      data: { name: 'Barbell Back Squat', muscleGroups: ['quads', 'glutes', 'hamstrings'], equipment: 'barbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Barbell Bench Press', muscleGroups: ['chest', 'triceps', 'shoulders'], equipment: 'barbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Deadlift', muscleGroups: ['back', 'glutes', 'hamstrings'], equipment: 'barbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Overhead Press', muscleGroups: ['shoulders', 'triceps'], equipment: 'barbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Pull-up', muscleGroups: ['back', 'biceps'], equipment: 'bodyweight' },
    }),
    prisma.exercise.create({
      data: { name: 'Barbell Row', muscleGroups: ['back', 'biceps'], equipment: 'barbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Dumbbell Lateral Raise', muscleGroups: ['shoulders'], equipment: 'dumbbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Romanian Deadlift', muscleGroups: ['hamstrings', 'glutes'], equipment: 'barbell' },
    }),
    prisma.exercise.create({
      data: { name: 'Leg Press', muscleGroups: ['quads', 'glutes'], equipment: 'machine' },
    }),
    prisma.exercise.create({
      data: { name: 'Cable Tricep Pushdown', muscleGroups: ['triceps'], equipment: 'cable' },
    }),
  ]);

  const [squat, bench, deadlift, ohp, pullup, row, lateralRaise, rdl, legPress, tricepPushdown] = exercises as [
    typeof exercises[0], typeof exercises[0], typeof exercises[0], typeof exercises[0],
    typeof exercises[0], typeof exercises[0], typeof exercises[0], typeof exercises[0],
    typeof exercises[0], typeof exercises[0],
  ];

  console.log(`Created ${exercises.length} exercises`);

  // Helper to create a program for a user
  async function createProgram(
    userId: string,
    name: string,
    sessionsData: Array<{ name: string; exercises: Array<{ exerciseId: string; sets: Array<{ reps: number; weight?: number; rpe?: number; restSeconds: number }> }> }>,
  ) {
    return prisma.program.create({
      data: {
        userId,
        name,
        weeks: {
          create: [1, 2].map((weekNumber) => ({
            weekNumber,
            sessions: {
              create: sessionsData.map((session) => ({
                name: session.name,
                plannedExercises: {
                  create: session.exercises.map((ex, orderIndex) => ({
                    orderIndex,
                    exerciseId: ex.exerciseId,
                    sets: {
                      create: ex.sets.map((set, setIndex) => ({ setIndex, ...set })),
                    },
                  })),
                },
              })),
            },
          })),
        },
      },
    });
  }

  // Program 1: Push/Pull/Legs
  await createProgram(alice.id, 'Push/Pull/Legs', [
    {
      name: 'Push',
      exercises: [
        { exerciseId: bench.id, sets: [{ reps: 5, weight: 60, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 60, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 60, rpe: 8, restSeconds: 180 }] },
        { exerciseId: ohp.id, sets: [{ reps: 8, weight: 35, rpe: 7, restSeconds: 120 }, { reps: 8, weight: 35, rpe: 7, restSeconds: 120 }, { reps: 8, weight: 35, rpe: 8, restSeconds: 120 }] },
        { exerciseId: tricepPushdown.id, sets: [{ reps: 12, rpe: 8, restSeconds: 90 }, { reps: 12, rpe: 8, restSeconds: 90 }, { reps: 12, rpe: 9, restSeconds: 90 }] },
        { exerciseId: lateralRaise.id, sets: [{ reps: 15, weight: 8, restSeconds: 60 }, { reps: 15, weight: 8, restSeconds: 60 }, { reps: 15, weight: 8, restSeconds: 60 }] },
      ],
    },
    {
      name: 'Pull',
      exercises: [
        { exerciseId: deadlift.id, sets: [{ reps: 5, weight: 80, rpe: 7, restSeconds: 240 }, { reps: 5, weight: 80, rpe: 8, restSeconds: 240 }] },
        { exerciseId: pullup.id, sets: [{ reps: 8, restSeconds: 120 }, { reps: 8, restSeconds: 120 }, { reps: 6, restSeconds: 120 }] },
        { exerciseId: row.id, sets: [{ reps: 10, weight: 50, rpe: 7, restSeconds: 120 }, { reps: 10, weight: 50, rpe: 7, restSeconds: 120 }, { reps: 10, weight: 50, rpe: 8, restSeconds: 120 }] },
      ],
    },
    {
      name: 'Legs',
      exercises: [
        { exerciseId: squat.id, sets: [{ reps: 5, weight: 70, rpe: 7, restSeconds: 240 }, { reps: 5, weight: 70, rpe: 7, restSeconds: 240 }, { reps: 5, weight: 70, rpe: 8, restSeconds: 240 }] },
        { exerciseId: rdl.id, sets: [{ reps: 8, weight: 50, rpe: 7, restSeconds: 150 }, { reps: 8, weight: 50, rpe: 7, restSeconds: 150 }, { reps: 8, weight: 50, rpe: 8, restSeconds: 150 }] },
        { exerciseId: legPress.id, sets: [{ reps: 12, weight: 100, restSeconds: 120 }, { reps: 12, weight: 100, restSeconds: 120 }, { reps: 12, weight: 100, restSeconds: 120 }] },
      ],
    },
  ]);

  // Program 2: Upper/Lower (for bob)
  await createProgram(bob.id, 'Upper/Lower', [
    {
      name: 'Upper A',
      exercises: [
        { exerciseId: bench.id, sets: [{ reps: 4, weight: 80, rpe: 7, restSeconds: 180 }, { reps: 4, weight: 80, rpe: 7, restSeconds: 180 }, { reps: 4, weight: 80, rpe: 8, restSeconds: 180 }, { reps: 4, weight: 80, rpe: 8, restSeconds: 180 }] },
        { exerciseId: row.id, sets: [{ reps: 4, weight: 70, rpe: 7, restSeconds: 180 }, { reps: 4, weight: 70, rpe: 7, restSeconds: 180 }, { reps: 4, weight: 70, rpe: 8, restSeconds: 180 }, { reps: 4, weight: 70, rpe: 8, restSeconds: 180 }] },
        { exerciseId: ohp.id, sets: [{ reps: 8, weight: 50, rpe: 7, restSeconds: 120 }, { reps: 8, weight: 50, rpe: 8, restSeconds: 120 }, { reps: 8, weight: 50, rpe: 8, restSeconds: 120 }] },
        { exerciseId: pullup.id, sets: [{ reps: 6, restSeconds: 120 }, { reps: 6, restSeconds: 120 }, { reps: 6, restSeconds: 120 }] },
      ],
    },
    {
      name: 'Lower A',
      exercises: [
        { exerciseId: squat.id, sets: [{ reps: 4, weight: 100, rpe: 7, restSeconds: 240 }, { reps: 4, weight: 100, rpe: 7, restSeconds: 240 }, { reps: 4, weight: 100, rpe: 8, restSeconds: 240 }, { reps: 4, weight: 100, rpe: 8, restSeconds: 240 }] },
        { exerciseId: rdl.id, sets: [{ reps: 8, weight: 70, rpe: 7, restSeconds: 150 }, { reps: 8, weight: 70, rpe: 7, restSeconds: 150 }, { reps: 8, weight: 70, rpe: 8, restSeconds: 150 }] },
        { exerciseId: legPress.id, sets: [{ reps: 10, weight: 160, restSeconds: 120 }, { reps: 10, weight: 160, restSeconds: 120 }, { reps: 10, weight: 160, restSeconds: 120 }] },
      ],
    },
  ]);

  // Program 3: Full Body (assigned to alice)
  await createProgram(alice.id, 'Full Body 3x', [
    {
      name: 'Full Body A',
      exercises: [
        { exerciseId: squat.id, sets: [{ reps: 5, weight: 60, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 60, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 60, rpe: 8, restSeconds: 180 }] },
        { exerciseId: bench.id, sets: [{ reps: 5, weight: 50, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 50, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 50, rpe: 8, restSeconds: 180 }] },
        { exerciseId: row.id, sets: [{ reps: 5, weight: 45, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 45, rpe: 7, restSeconds: 180 }, { reps: 5, weight: 45, rpe: 8, restSeconds: 180 }] },
      ],
    },
  ]);

  console.log('Created 3 programs');

  // Seed 30 days of health data per user
  const users = [alice, bob];
  for (const user of users) {
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      await prisma.dailyHealth.create({
        data: {
          userId: user.id,
          date,
          steps: Math.floor(6000 + Math.random() * 6000),
          caloriesActive: Math.floor(300 + Math.random() * 400),
          caloriesTotal: Math.floor(1800 + Math.random() * 800),
          heartRateResting: Math.floor(52 + Math.random() * 20),
          hrvRmssd: 30 + Math.random() * 40,
          sleepDurationMinutes: Math.floor(360 + Math.random() * 120),
          sleepScore: Math.floor(60 + Math.random() * 35),
          recoveryScore: Math.floor(50 + Math.random() * 45),
          strainScore: Math.floor(5 + Math.random() * 12),
        },
      });
    }
  }

  console.log('Created 60 daily health records (30 per user)');

  // Seed workout logs (8 per user, spread over last 4 weeks)
  for (const user of users) {
    for (let i = 0; i < 8; i++) {
      const startedAt = new Date();
      startedAt.setDate(startedAt.getDate() - i * 3 - Math.floor(Math.random() * 2));
      startedAt.setHours(7 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);

      const durationMinutes = 40 + Math.floor(Math.random() * 30);
      const completedAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

      // Pick 3-4 random exercises
      const numExercises = 3 + Math.floor(Math.random() * 2);
      const shuffled = [...exercises].sort(() => Math.random() - 0.5).slice(0, numExercises);

      const hrSamples: Array<{ timestamp: Date; bpm: number; zone: string }> = [];
      for (let m = 0; m < durationMinutes; m += 2) {
        const bpm = 100 + Math.floor(Math.random() * 60);
        const zone = bpm < 120 ? 'fat_burn' : bpm < 150 ? 'cardio' : 'peak';
        hrSamples.push({
          timestamp: new Date(startedAt.getTime() + m * 60 * 1000),
          bpm,
          zone,
        });
      }

      await prisma.workoutLog.create({
        data: {
          userId: user.id,
          startedAt,
          completedAt,
          exerciseLogs: {
            create: shuffled.map((ex) => {
              const numSets = 3 + Math.floor(Math.random() * 2);
              return {
                exerciseId: ex.id,
                completedSets: {
                  create: Array.from({ length: numSets }, (_, setIdx) => ({
                    setIndex: setIdx,
                    reps: 5 + Math.floor(Math.random() * 8),
                    weight: 20 + Math.floor(Math.random() * 60),
                    rpe: Math.random() > 0.3 ? 6 + Math.floor(Math.random() * 4) : null,
                    restTaken: 60 + Math.floor(Math.random() * 120),
                    heartRateAtCompletion: Math.random() > 0.4 ? 120 + Math.floor(Math.random() * 40) : null,
                  })),
                },
              };
            }),
          },
          heartRateSamples: {
            create: hrSamples,
          },
        },
      });
    }
  }

  console.log('Created 16 workout logs (8 per user) with HR samples');

  // Seed run sessions (6 per user, spread over last 3 weeks)
  for (const user of users) {
    for (let i = 0; i < 6; i++) {
      const startedAt = new Date();
      startedAt.setDate(startedAt.getDate() - i * 4 - Math.floor(Math.random() * 2));
      startedAt.setHours(6 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);

      const distanceMeters = 3000 + Math.floor(Math.random() * 7000);
      const paceBase = 280 + Math.floor(Math.random() * 120);
      const durationSeconds = Math.round((distanceMeters / 1000) * paceBase);
      const completedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

      // Generate GPS points (one every ~100m)
      const numPoints = Math.floor(distanceMeters / 100);
      const baseLat = 48.8566 + (Math.random() - 0.5) * 0.02;
      const baseLng = 2.3522 + (Math.random() - 0.5) * 0.02;

      const gpsPoints: Array<{
        lat: number;
        lng: number;
        altitudeMeters: number;
        timestamp: Date;
        speedMps: number;
      }> = [];

      let altitude = 30 + Math.random() * 20;
      for (let p = 0; p < numPoints; p++) {
        const angle = (p / numPoints) * Math.PI * 2 * (0.5 + Math.random() * 0.5);
        const radius = 0.002 + Math.random() * 0.003;
        altitude += (Math.random() - 0.45) * 3;
        gpsPoints.push({
          lat: baseLat + Math.sin(angle) * radius,
          lng: baseLng + Math.cos(angle) * radius,
          altitudeMeters: Math.max(0, altitude),
          timestamp: new Date(startedAt.getTime() + (p / numPoints) * durationSeconds * 1000),
          speedMps: 1000 / paceBase + (Math.random() - 0.5) * 0.5,
        });
      }

      // HR samples every 30s
      const runHR: Array<{ timestamp: Date; bpm: number; zone: string }> = [];
      for (let s = 0; s < durationSeconds; s += 30) {
        const bpm = 135 + Math.floor(Math.random() * 35);
        const zone = bpm < 145 ? 'fat_burn' : bpm < 165 ? 'cardio' : 'peak';
        runHR.push({
          timestamp: new Date(startedAt.getTime() + s * 1000),
          bpm,
          zone,
        });
      }

      const elevationGain = gpsPoints.reduce((gain, point, idx) => {
        if (idx === 0) return 0;
        const diff = point.altitudeMeters - gpsPoints[idx - 1]!.altitudeMeters;
        return gain + (diff > 0 ? diff : 0);
      }, 0);

      await prisma.runSession.create({
        data: {
          userId: user.id,
          startedAt,
          completedAt,
          distanceMeters,
          durationSeconds,
          avgPaceSecondsPerKm: paceBase,
          bestPaceSecondsPerKm: paceBase - 15 - Math.floor(Math.random() * 20),
          elevationGainMeters: Math.round(elevationGain),
          gpsPoints: { create: gpsPoints },
          heartRateSamples: { create: runHR },
        },
      });
    }
  }

  console.log('Created 12 run sessions (6 per user) with GPS + HR data');
  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
