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

  // Marseille running routes — realistic GPS waypoints
  const marseilleRoutes: Array<{ name: string; waypoints: Array<[number, number, number]>; distanceMeters: number }> = [
    {
      // Corniche Kennedy — along the coast
      name: 'Corniche Kennedy',
      distanceMeters: 5200,
      waypoints: [
        [43.2780, 5.3590, 5], [43.2770, 5.3570, 8], [43.2758, 5.3545, 15],
        [43.2745, 5.3520, 22], [43.2730, 5.3500, 30], [43.2715, 5.3478, 35],
        [43.2700, 5.3455, 28], [43.2688, 5.3430, 20], [43.2675, 5.3405, 15],
        [43.2660, 5.3380, 10], [43.2648, 5.3358, 8], [43.2635, 5.3335, 12],
        [43.2622, 5.3312, 18], [43.2610, 5.3290, 25], [43.2598, 5.3268, 20],
        [43.2585, 5.3245, 15], [43.2575, 5.3225, 10], [43.2565, 5.3205, 8],
      ],
    },
    {
      // Vieux-Port loop — around the old harbour
      name: 'Vieux-Port',
      distanceMeters: 3800,
      waypoints: [
        [43.2965, 5.3698, 3], [43.2958, 5.3715, 3], [43.2950, 5.3730, 4],
        [43.2942, 5.3745, 3], [43.2935, 5.3755, 3], [43.2928, 5.3742, 4],
        [43.2920, 5.3728, 5], [43.2912, 5.3715, 4], [43.2905, 5.3700, 3],
        [43.2910, 5.3685, 3], [43.2918, 5.3672, 4], [43.2926, 5.3660, 5],
        [43.2935, 5.3650, 6], [43.2943, 5.3662, 5], [43.2950, 5.3675, 4],
        [43.2958, 5.3688, 3], [43.2965, 5.3698, 3],
      ],
    },
    {
      // Parc Borély — park loop near the beach
      name: 'Parc Borély',
      distanceMeters: 4500,
      waypoints: [
        [43.2610, 5.3830, 5], [43.2618, 5.3845, 6], [43.2628, 5.3860, 7],
        [43.2640, 5.3870, 8], [43.2652, 5.3875, 7], [43.2662, 5.3865, 6],
        [43.2670, 5.3850, 5], [43.2675, 5.3835, 4], [43.2672, 5.3818, 5],
        [43.2665, 5.3802, 6], [43.2655, 5.3790, 7], [43.2642, 5.3785, 8],
        [43.2630, 5.3790, 7], [43.2620, 5.3800, 6], [43.2612, 5.3815, 5],
        [43.2610, 5.3830, 5],
      ],
    },
    {
      // Calanques trail — hilly coastal path
      name: 'Calanques',
      distanceMeters: 7200,
      waypoints: [
        [43.2310, 5.4350, 45], [43.2298, 5.4368, 60], [43.2285, 5.4385, 85],
        [43.2270, 5.4400, 110], [43.2255, 5.4418, 130], [43.2242, 5.4435, 95],
        [43.2228, 5.4450, 70], [43.2215, 5.4465, 50], [43.2200, 5.4480, 80],
        [43.2188, 5.4498, 120], [43.2175, 5.4515, 145], [43.2162, 5.4530, 110],
        [43.2148, 5.4545, 75], [43.2135, 5.4560, 55], [43.2125, 5.4575, 40],
        [43.2118, 5.4590, 30], [43.2112, 5.4605, 25], [43.2108, 5.4620, 20],
        [43.2105, 5.4635, 15], [43.2102, 5.4650, 10],
      ],
    },
    {
      // Plages du Prado — flat beach run
      name: 'Plages du Prado',
      distanceMeters: 3200,
      waypoints: [
        [43.2615, 5.3755, 3], [43.2605, 5.3740, 3], [43.2595, 5.3725, 3],
        [43.2585, 5.3710, 3], [43.2575, 5.3698, 3], [43.2565, 5.3685, 3],
        [43.2555, 5.3672, 3], [43.2545, 5.3660, 3], [43.2535, 5.3648, 3],
        [43.2525, 5.3635, 3], [43.2515, 5.3622, 3], [43.2505, 5.3610, 3],
      ],
    },
    {
      // Panier quartier — old town hills
      name: 'Le Panier',
      distanceMeters: 2800,
      waypoints: [
        [43.2985, 5.3665, 15], [43.2992, 5.3650, 25], [43.2998, 5.3638, 35],
        [43.3005, 5.3625, 45], [43.3010, 5.3612, 50], [43.3015, 5.3600, 42],
        [43.3020, 5.3588, 35], [43.3012, 5.3578, 28], [43.3002, 5.3572, 22],
        [43.2992, 5.3580, 18], [43.2985, 5.3592, 20], [43.2980, 5.3608, 22],
        [43.2978, 5.3625, 20], [43.2980, 5.3642, 18], [43.2985, 5.3658, 15],
      ],
    },
  ];

  // Interpolate smooth GPS track between waypoints
  function interpolateRoute(
    waypoints: Array<[number, number, number]>,
    numPoints: number,
    startTime: Date,
    durationSeconds: number,
    paceBase: number,
  ) {
    const points: Array<{ lat: number; lng: number; altitudeMeters: number; timestamp: Date; speedMps: number }> = [];
    const totalSegments = waypoints.length - 1;
    const pointsPerSegment = Math.ceil(numPoints / totalSegments);

    for (let seg = 0; seg < totalSegments; seg++) {
      const [lat1, lng1, alt1] = waypoints[seg]!;
      const [lat2, lng2, alt2] = waypoints[seg + 1]!;
      const stepsInSeg = seg === totalSegments - 1 ? numPoints - points.length : pointsPerSegment;

      for (let s = 0; s < stepsInSeg; s++) {
        const t = s / stepsInSeg;
        const idx = points.length;
        const jitter = () => (Math.random() - 0.5) * 0.00005; // ~5m GPS noise
        points.push({
          lat: lat1 + (lat2 - lat1) * t + jitter(),
          lng: lng1 + (lng2 - lng1) * t + jitter(),
          altitudeMeters: alt1 + (alt2 - alt1) * t + (Math.random() - 0.5) * 2,
          timestamp: new Date(startTime.getTime() + (idx / numPoints) * durationSeconds * 1000),
          speedMps: 1000 / paceBase + (Math.random() - 0.5) * 0.4,
        });
      }
    }

    return points;
  }

  // Seed run sessions (6 per user, spread over last 3 weeks) in Marseille
  for (const user of users) {
    for (let i = 0; i < 6; i++) {
      const route = marseilleRoutes[i % marseilleRoutes.length]!;
      const startedAt = new Date();
      startedAt.setDate(startedAt.getDate() - i * 4 - Math.floor(Math.random() * 2));
      startedAt.setHours(6 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);

      const distanceMeters = route.distanceMeters + Math.floor(Math.random() * 500 - 250);
      const paceBase = 280 + Math.floor(Math.random() * 120);
      const durationSeconds = Math.round((distanceMeters / 1000) * paceBase);
      const completedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

      const numPoints = Math.floor(distanceMeters / 30);
      const gpsPoints = interpolateRoute(route.waypoints, numPoints, startedAt, durationSeconds, paceBase);

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

  console.log('Created 12 run sessions (6 per user) with Marseille GPS routes + HR data');
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
