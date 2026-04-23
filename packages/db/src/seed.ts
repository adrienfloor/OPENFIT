import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { computeCaloriesFromHRSamples, ageYearsFromDob } from '@openfit/fitness-core';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Clear existing data in dependency order
  await prisma.heartRateSample.deleteMany();
  await prisma.completedSet.deleteMany();
  await prisma.exerciseLog.deleteMany();
  await prisma.gPSPoint.deleteMany();
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
      heightCm: 165,
      sex: 'female',
      role: 'user',
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@openfit.dev',
      passwordHash,
      name: 'Bob Lifter',
      dateOfBirth: new Date('1990-02-22'),
      weightKg: 80,
      heightCm: 180,
      sex: 'male',
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
          effortScore: Math.floor(30 + Math.random() * 60),
          effortEarnedMinutes: Math.floor(20 + Math.random() * 120),
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

      const caloriesBurned = computeCaloriesFromHRSamples({
        samples: hrSamples.map((s) => ({ timestamp: s.timestamp, bpm: s.bpm })),
        weightKg: user.weightKg,
        ageYears: ageYearsFromDob(user.dateOfBirth),
        sex: user.sex,
      });

      await prisma.workoutLog.create({
        data: {
          userId: user.id,
          type: 'strength',
          startedAt,
          completedAt,
          durationSeconds: durationMinutes * 60,
          caloriesBurned,
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

  // Marseille running routes — waypoints follow actual roads/paths [lat, lng, altitude]
  const marseilleRoutes: Array<{ name: string; waypoints: Array<[number, number, number]>; distanceMeters: number }> = [
    {
      // Corniche Kennedy: Plage des Catalans → Vallon des Auffes → Malmousque → Prophète beach
      // Follows the actual coastal road (Avenue de la Corse → Corniche Kennedy)
      name: 'Corniche Kennedy',
      distanceMeters: 4800,
      waypoints: [
        [43.2867, 5.3549, 8],   // Plage des Catalans
        [43.2855, 5.3535, 12],  // Rue des Catalans
        [43.2843, 5.3520, 18],  // Start of Corniche
        [43.2830, 5.3510, 25],  // Vallon des Auffes overlook
        [43.2818, 5.3498, 30],  // Anse de Malmousque
        [43.2803, 5.3485, 28],  // Corniche bend
        [43.2788, 5.3478, 25],  // Malmousque
        [43.2770, 5.3472, 22],  // Continuing south on Corniche
        [43.2755, 5.3465, 18],  // Near Fausse Monnaie
        [43.2738, 5.3460, 15],  // Plage du Prophète approach
        [43.2722, 5.3455, 8],   // Plage du Prophète
      ],
    },
    {
      // Vieux-Port: Quai des Belges → Fort Saint-Jean → MuCEM → Quai de Rive Neuve → back
      // Loop around the old harbour following the quays
      name: 'Vieux-Port',
      distanceMeters: 3200,
      waypoints: [
        [43.2943, 5.3753, 3],   // Quai des Belges (bottom of port)
        [43.2950, 5.3740, 3],   // Along Quai du Port (north side)
        [43.2958, 5.3723, 4],   // Mairie de Marseille
        [43.2965, 5.3705, 4],   // Hôtel de Ville
        [43.2970, 5.3688, 5],   // Fort Saint-Jean approach
        [43.2967, 5.3670, 8],   // Fort Saint-Jean
        [43.2960, 5.3660, 10],  // MuCEM area
        [43.2952, 5.3668, 5],   // Esplanade J4
        [43.2945, 5.3680, 4],   // Heading to south quay
        [43.2935, 5.3695, 3],   // Quai de Rive Neuve
        [43.2930, 5.3715, 3],   // Théâtre La Criée
        [43.2932, 5.3735, 3],   // Along Rive Neuve
        [43.2938, 5.3748, 3],   // Approaching Belges
        [43.2943, 5.3753, 3],   // Back to start
      ],
    },
    {
      // Parc Borély: loop inside the park + along Av du Prado towards the beach
      // Follows the park paths and Avenue du Prado
      name: 'Parc Borély',
      distanceMeters: 3800,
      waypoints: [
        [43.2595, 5.3810, 8],   // Park entrance (Av du Prado side)
        [43.2588, 5.3822, 7],   // Main alley heading east
        [43.2580, 5.3838, 6],   // Near the château
        [43.2572, 5.3848, 5],   // Lac Borély north
        [43.2562, 5.3852, 5],   // Lac east side
        [43.2555, 5.3842, 5],   // Lac south
        [43.2558, 5.3828, 5],   // Lac west side
        [43.2565, 5.3815, 6],   // Back towards north
        [43.2575, 5.3805, 7],   // Jardin botanique
        [43.2585, 5.3795, 8],   // Near hippodrome
        [43.2592, 5.3788, 7],   // Av de Bonneveine
        [43.2598, 5.3798, 7],   // Heading back east
        [43.2595, 5.3810, 8],   // Back to start
      ],
    },
    {
      // Calanques: Luminy campus → Col de Sugiton → Calanque de Sugiton overlook → back
      // Trail running on GR51 / marked hiking paths
      name: 'Calanques - Sugiton',
      distanceMeters: 6500,
      waypoints: [
        [43.2330, 5.4390, 160],  // Campus de Luminy parking
        [43.2315, 5.4378, 180],  // Trail head
        [43.2300, 5.4365, 210],  // Climbing through garrigue
        [43.2285, 5.4350, 260],  // Rocky switchbacks
        [43.2270, 5.4338, 310],  // Col de Sugiton approach
        [43.2258, 5.4325, 340],  // Col de Sugiton
        [43.2245, 5.4315, 290],  // Descending towards calanque
        [43.2235, 5.4305, 230],  // Overlook point
        [43.2228, 5.4298, 180],  // Calanque de Sugiton view
        [43.2235, 5.4305, 230],  // Turning back
        [43.2245, 5.4315, 290],  // Climbing back up
        [43.2258, 5.4325, 340],  // Col again
        [43.2270, 5.4338, 310],  // Descending
        [43.2285, 5.4350, 260],  // Back through garrigue
        [43.2300, 5.4365, 210],  // Lower trail
        [43.2315, 5.4378, 180],  // Near campus
        [43.2330, 5.4390, 160],  // Back at Luminy
      ],
    },
    {
      // Prado beaches: along Promenade Georges Pompidou (the seafront promenade)
      // Flat run along the beach from Rondpoint du Prado to Pointe Rouge
      name: 'Plages du Prado',
      distanceMeters: 3500,
      waypoints: [
        [43.2630, 5.3785, 3],   // Rond-point du Prado / beach start
        [43.2618, 5.3790, 3],   // Promenade heading south
        [43.2605, 5.3795, 3],   // Prado beach 1
        [43.2590, 5.3800, 3],   // Between beaches
        [43.2575, 5.3808, 3],   // Prado beach 2
        [43.2560, 5.3815, 3],   // Escale Borély
        [43.2545, 5.3825, 3],   // Continuing south
        [43.2530, 5.3835, 3],   // Near Parc Balnéaire
        [43.2518, 5.3845, 3],   // Plage de la Vieille Chapelle
        [43.2505, 5.3855, 4],   // Approaching Pointe Rouge
        [43.2492, 5.3862, 4],   // Pointe Rouge
      ],
    },
    {
      // Le Panier: Vieille Charité → Place des Moulins → Montée des Accoules → Place Daviel
      // Hilly old town streets
      name: 'Le Panier',
      distanceMeters: 2500,
      waypoints: [
        [43.2990, 5.3700, 25],  // Rue de la Charité / Vieille Charité
        [43.2995, 5.3688, 35],  // Rue du Refuge
        [43.3000, 5.3678, 42],  // Place des Moulins
        [43.2998, 5.3665, 40],  // Rue des Moulins descending
        [43.2992, 5.3655, 35],  // Rue du Petit Puits
        [43.2985, 5.3648, 30],  // Montée des Accoules
        [43.2978, 5.3658, 22],  // Rue Caisserie
        [43.2972, 5.3670, 15],  // Place Daviel
        [43.2968, 5.3682, 10],  // Heading to port
        [43.2975, 5.3695, 8],   // Quai du Port
        [43.2982, 5.3705, 12],  // Back up towards Panier
        [43.2990, 5.3700, 25],  // Back to start
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
        const jitter = () => (Math.random() - 0.5) * 0.00002; // ~2m GPS noise
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

      const runCalories = computeCaloriesFromHRSamples({
        samples: runHR.map((s) => ({ timestamp: s.timestamp, bpm: s.bpm })),
        weightKg: user.weightKg,
        ageYears: ageYearsFromDob(user.dateOfBirth),
        sex: user.sex,
      });

      await prisma.workoutLog.create({
        data: {
          userId: user.id,
          type: 'run',
          startedAt,
          completedAt,
          durationSeconds,
          caloriesBurned: runCalories,
          distanceMeters,
          avgPaceSecondsPerKm: paceBase,
          bestPaceSecondsPerKm: paceBase - 15 - Math.floor(Math.random() * 20),
          elevationGainMeters: Math.round(elevationGain),
          gpsPoints: { create: gpsPoints },
          heartRateSamples: { create: runHR },
        },
      });
    }
  }

  console.log('Created 12 run workout logs (6 per user) with Marseille GPS routes + HR data');
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
