import { describe, expect, it } from 'vitest';
import {
  GeneratedProgramSchema,
  type CoachPromptInput,
  type GeneratedProgram,
} from '@openfit/types';
import { buildCoachPrompt } from '../coach-prompt';

const baseInput: CoachPromptInput = {
  profile: {
    goal: 'aesthetics',
    experience: 'intermediate',
    gymSessionsPerWeek: 4,
    sessionDurationMinutes: 60,
    availableEquipment: ['barbell', 'dumbbell', 'cable'],
    emphasis: ['back', 'arms'],
    secondarySports: [
      { type: 'jiu_jitsu', sessionsPerWeek: 2, avgDurationMinutes: 90 },
      { type: 'run', sessionsPerWeek: 2, avgDurationMinutes: 45 },
    ],
    injuriesNotes: 'mild right shoulder, avoid heavy overhead pressing',
  },
  user: { ageYears: 36, weightKg: 80, heightCm: 180, sex: 'male' },
  recent: {
    strengthSessionsLast30d: 12,
    avgRpeLast30d: 7.4,
    runKmLast30d: 38.5,
    runSessionsLast30d: 8,
    jiuJitsuSessionsLast30d: 7,
    avgWeeklyEffortMinutes: 220,
    avgReadiness7d: 68,
    acwr: 1.15,
  },
  topSets: [
    {
      exerciseId: 'ex_squat',
      exerciseName: 'Barbell Back Squat',
      bestReps: 5,
      bestWeightKg: 120,
      estimated1RMKg: 138,
    },
    {
      exerciseId: 'ex_bench',
      exerciseName: 'Barbell Bench Press',
      bestReps: 5,
      bestWeightKg: 95,
      estimated1RMKg: 109,
    },
  ],
  exerciseLibrary: [
    {
      id: 'ex_squat',
      name: 'Barbell Back Squat',
      muscleGroups: ['quads', 'glutes'],
      equipment: 'barbell',
    },
    {
      id: 'ex_bench',
      name: 'Barbell Bench Press',
      muscleGroups: ['chest', 'triceps'],
      equipment: 'barbell',
    },
    {
      id: 'ex_row',
      name: 'Barbell Row',
      muscleGroups: ['back', 'biceps'],
      equipment: 'barbell',
    },
    {
      id: 'ex_curl',
      name: 'Dumbbell Curl',
      muscleGroups: ['biceps'],
      equipment: 'dumbbell',
    },
  ],
};

describe('buildCoachPrompt', () => {
  it('renders all profile, recent, top-set, and library sections', () => {
    const { system, user } = buildCoachPrompt(baseInput);

    expect(system).toContain('strength & conditioning coach');
    expect(system).toContain('GeneratedProgram');

    expect(user).toContain('Sex: male, age: 36, weight: 80kg, height: 180cm');
    expect(user).toContain('Primary goal: aesthetics');
    expect(user).toContain('Available equipment: barbell, dumbbell, cable');
    expect(user).toContain('Emphasis muscle groups: back, arms');
    expect(user).toContain('jiu_jitsu 2x/week 90min, run 2x/week 45min');
    expect(user).toContain('mild right shoulder');

    expect(user).toContain('Strength sessions completed: 12');
    expect(user).toContain('Avg RPE on strength sessions: 7.4');
    expect(user).toContain('Run volume: 38.5km across 8 sessions');
    expect(user).toContain('Jiu-jitsu sessions: 7');
    expect(user).toContain('7-day BioCharge avg: 68');
    expect(user).toContain('ACWR: 1.15 (ok)');

    expect(user).toContain('Barbell Back Squat [ex_squat]: 120kg x 5, est 1RM 138kg');
    expect(user).toContain('ex_curl: Dumbbell Curl - biceps (dumbbell)');
  });

  it('handles missing optional inputs gracefully', () => {
    const { user } = buildCoachPrompt({
      ...baseInput,
      profile: {
        ...baseInput.profile,
        emphasis: [],
        secondarySports: [],
        injuriesNotes: undefined,
      },
      recent: {
        ...baseInput.recent,
        avgRpeLast30d: null,
        avgWeeklyEffortMinutes: null,
        avgReadiness7d: null,
        acwr: null,
      },
      topSets: [],
    });

    expect(user).toContain('Emphasis muscle groups: none specified');
    expect(user).toContain('Secondary sports: none');
    expect(user).toContain('Injuries / limitations: none');
    expect(user).toContain('Avg RPE on strength sessions: unknown');
    expect(user).toContain('7-day BioCharge avg: unknown');
    expect(user).toContain('ACWR: unknown');
    expect(user).toContain('No lift history yet');
  });

  it('flags elevated and high-risk ACWR', () => {
    const elevated = buildCoachPrompt({
      ...baseInput,
      recent: { ...baseInput.recent, acwr: 1.4 },
    }).user;
    expect(elevated).toContain('ACWR: 1.40 (elevated)');

    const high = buildCoachPrompt({
      ...baseInput,
      recent: { ...baseInput.recent, acwr: 1.7 },
    }).user;
    expect(high).toContain('ACWR: 1.70 (high risk)');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Schema parsing — the contract the LLM must satisfy.
// ──────────────────────────────────────────────────────────────────────────

const exampleProgram: GeneratedProgram = {
  name: '5-week aesthetics block',
  durationWeeks: 5,
  overview:
    'A four-day upper/lower hypertrophy block. Weeks 1-2 build volume at moderate RPE; weeks 3-4 push intensity; week 5 deloads to absorb the work and prepare for the next mesocycle.',
  weeks: [
    {
      weekNumber: 1,
      phase: 'accumulation',
      summary: 'Establish working weights at RPE 7.',
      sessions: [
        {
          name: 'Upper A',
          focus: 'Horizontal press + back thickness',
          estimatedDurationMinutes: 60,
          exercises: [
            {
              exerciseId: 'ex_bench',
              sets: [
                { reps: 8, loadPctOf1RM: 0.72, rpe: 7, restSeconds: 150 },
                { reps: 8, loadPctOf1RM: 0.72, rpe: 7, restSeconds: 150 },
                { reps: 8, loadPctOf1RM: 0.72, rpe: 7, restSeconds: 150 },
              ],
              rationale: 'Main horizontal press to anchor chest volume for the week.',
            },
            {
              exerciseId: 'ex_row',
              sets: [
                { reps: 10, rpe: 7, restSeconds: 120 },
                { reps: 10, rpe: 7, restSeconds: 120 },
                { reps: 10, rpe: 7, restSeconds: 120 },
              ],
              rationale: 'Heavy rowing for back thickness; matches pressing volume.',
            },
            {
              exerciseId: 'ex_curl',
              sets: [
                { reps: 12, rpe: 7, restSeconds: 60 },
                { reps: 12, rpe: 7, restSeconds: 60 },
              ],
              rationale: 'Direct biceps work to honour the user emphasis.',
            },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      phase: 'accumulation',
      summary: 'Add one back-off set per main lift.',
      sessions: [
        {
          name: 'Upper A',
          focus: 'Horizontal press + back thickness',
          estimatedDurationMinutes: 65,
          exercises: [
            {
              exerciseId: 'ex_bench',
              sets: [
                { reps: 8, loadPctOf1RM: 0.74, rpe: 7, restSeconds: 150 },
                { reps: 8, loadPctOf1RM: 0.74, rpe: 7, restSeconds: 150 },
                { reps: 8, loadPctOf1RM: 0.74, rpe: 7, restSeconds: 150 },
                { reps: 10, loadPctOf1RM: 0.6, rpe: 6, restSeconds: 120 },
              ],
              rationale: 'Main pressing plus a back-off for added volume.',
            },
            {
              exerciseId: 'ex_row',
              sets: [
                { reps: 10, rpe: 7.5, restSeconds: 120 },
                { reps: 10, rpe: 7.5, restSeconds: 120 },
                { reps: 10, rpe: 7.5, restSeconds: 120 },
              ],
              rationale: 'Heavy rowing to maintain back balance.',
            },
            {
              exerciseId: 'ex_curl',
              sets: [
                { reps: 12, rpe: 7, restSeconds: 60 },
                { reps: 12, rpe: 7, restSeconds: 60 },
                { reps: 12, rpe: 7, restSeconds: 60 },
              ],
              rationale: 'Bumped to three sets to honour arm emphasis.',
            },
          ],
        },
      ],
    },
    {
      weekNumber: 3,
      phase: 'intensification',
      summary: 'Drop reps, push load on the main lift.',
      sessions: [
        {
          name: 'Upper A',
          focus: 'Heavy press',
          estimatedDurationMinutes: 60,
          exercises: [
            {
              exerciseId: 'ex_bench',
              sets: [
                { reps: 5, loadPctOf1RM: 0.85, rpe: 8.5, restSeconds: 180 },
                { reps: 5, loadPctOf1RM: 0.85, rpe: 8.5, restSeconds: 180 },
                { reps: 5, loadPctOf1RM: 0.85, rpe: 8.5, restSeconds: 180 },
              ],
              rationale: 'Lower reps, heavier load — peak strength stimulus.',
            },
            {
              exerciseId: 'ex_row',
              sets: [
                { reps: 6, rpe: 8.5, restSeconds: 150 },
                { reps: 6, rpe: 8.5, restSeconds: 150 },
                { reps: 6, rpe: 8.5, restSeconds: 150 },
              ],
              rationale: 'Heavy rowing to match pressing intensity.',
            },
            {
              exerciseId: 'ex_curl',
              sets: [
                { reps: 8, rpe: 8, restSeconds: 75 },
                { reps: 8, rpe: 8, restSeconds: 75 },
                { reps: 8, rpe: 8, restSeconds: 75 },
              ],
              rationale: 'Heavier curls for direct arm hypertrophy.',
            },
          ],
        },
      ],
    },
  ],
  assumptions: {
    primaryGoal: 'aesthetics',
    weeklyStrengthSessions: 4,
    cardioLoadConsidered: true,
    deloadStrategy: 'Week 5 cuts working sets in half and caps RPE at 6.',
  },
};

describe('GeneratedProgramSchema', () => {
  it('parses a realistic program', () => {
    const result = GeneratedProgramSchema.safeParse(exampleProgram);
    expect(result.success).toBe(true);
  });

  it('rejects loadPctOf1RM > 1', () => {
    const bad = JSON.parse(JSON.stringify(exampleProgram));
    bad.weeks[0].sessions[0].exercises[0].sets[0].loadPctOf1RM = 1.5;
    expect(GeneratedProgramSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects sessions with fewer than 3 exercises', () => {
    const bad = JSON.parse(JSON.stringify(exampleProgram));
    bad.weeks[0].sessions[0].exercises = bad.weeks[0].sessions[0].exercises.slice(0, 2);
    expect(GeneratedProgramSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects rationale longer than 200 chars', () => {
    const bad = JSON.parse(JSON.stringify(exampleProgram));
    bad.weeks[0].sessions[0].exercises[0].rationale = 'x'.repeat(201);
    expect(GeneratedProgramSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects programs shorter than 3 weeks', () => {
    const bad = JSON.parse(JSON.stringify(exampleProgram));
    bad.weeks = bad.weeks.slice(0, 2);
    expect(GeneratedProgramSchema.safeParse(bad).success).toBe(false);
  });
});
