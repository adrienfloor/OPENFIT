/**
 * Builds the system + user prompt for the AI coach's program generator.
 *
 * Pure function — takes a fully-resolved CoachPromptInput and returns the
 * exact strings to send to the LLM. No I/O, no LLM calls. The backend
 * route is responsible for assembling the input and calling Claude with
 * the GeneratedProgramSchema as the structured-output contract.
 */

import type {
  CoachPromptInput,
  CoachExerciseLibraryEntry,
  CoachTopSet,
  SecondarySport,
} from '@openfit/types';

export interface CoachPrompt {
  system: string;
  user: string;
}

const SYSTEM_PROMPT = `You are a strength & conditioning coach generating a structured training \
program. You MUST return valid JSON matching the GeneratedProgram schema you \
were given. No prose outside the JSON.

# Programming rules
- Default mesocycle length 5 weeks: weeks 1-2 accumulation (RPE 6-7, moderate \
volume), weeks 3-4 intensification (RPE 8-9, slightly lower reps), week 5 \
deload (~50% volume, RPE 5-6). You may extend to 6-8 weeks for advanced users \
or compress to 3-4 weeks for fat_loss with high cardio load.
- Respect total weekly load. If secondary sports >3 sessions/week OR ACWR \
>1.3, reduce strength volume by ~20% and bias upper body on days adjacent \
to leg-intensive sport sessions.
- Each session must hit its stated focus and finish within the user's \
target session duration including rest.
- Compound lifts go first. 1-2 main lifts + 3-5 accessories per session.
- For aesthetics goal: 8-15 reps dominant, 10-20 working sets per muscle \
group per week.
- For strength goal: 3-6 reps on main lifts, lower volume, longer rest.
- For fat_loss: same as aesthetics but slightly higher density (shorter \
rest on accessories, more supersets implied).
- For hybrid / performance: balance strength + power; include explosive \
work where equipment allows.
- Never prescribe loadPctOf1RM for an exercise the user has no logged \
history of - omit the field and use rpe-only prescription instead.
- Only use exerciseId values from the provided exercise library. Never \
invent IDs.
- rationale per exercise: one sentence, plain language, why this exercise \
fits the user's goal and current week.
- weekly summary: one sentence, what changes vs the previous week.
- overview: ~3 sentences, what the user can expect across the whole \
mesocycle.`;

export function buildCoachPrompt(input: CoachPromptInput): CoachPrompt {
  const lines: string[] = [];

  lines.push('# User profile');
  lines.push(
    `- Sex: ${input.user.sex}, age: ${input.user.ageYears}, weight: ${input.user.weightKg}kg, height: ${input.user.heightCm}cm`,
  );
  lines.push(`- Experience: ${input.profile.experience}`);
  lines.push(`- Primary goal: ${input.profile.goal}`);
  lines.push(`- Available equipment: ${input.profile.availableEquipment.join(', ')}`);
  lines.push(`- Gym sessions/week wanted: ${input.profile.gymSessionsPerWeek}`);
  lines.push(`- Session duration target: ${input.profile.sessionDurationMinutes} min`);
  lines.push(
    `- Emphasis muscle groups: ${input.profile.emphasis.length ? input.profile.emphasis.join(', ') : 'none specified'}`,
  );
  lines.push(`- Secondary sports: ${formatSecondarySports(input.profile.secondarySports)}`);
  lines.push(`- Injuries / limitations: ${input.profile.injuriesNotes?.trim() || 'none'}`);

  lines.push('');
  lines.push('# Recent training data (last 30 days)');
  lines.push(`- Strength sessions completed: ${input.recent.strengthSessionsLast30d}`);
  lines.push(
    `- Avg RPE on strength sessions: ${formatNullable(input.recent.avgRpeLast30d, (n) => n.toFixed(1))}`,
  );
  lines.push(
    `- Run volume: ${input.recent.runKmLast30d.toFixed(1)}km across ${input.recent.runSessionsLast30d} sessions`,
  );
  lines.push(`- Jiu-jitsu sessions: ${input.recent.jiuJitsuSessionsLast30d}`);
  lines.push(
    `- Weekly avg earned effort minutes: ${formatNullable(input.recent.avgWeeklyEffortMinutes, (n) => Math.round(n).toString())}`,
  );
  lines.push(
    `- 7-day BioCharge avg: ${formatNullable(input.recent.avgReadiness7d, (n) => Math.round(n).toString())} (target ~70)`,
  );
  lines.push(`- ACWR: ${formatACWR(input.recent.acwr)}`);

  lines.push('');
  lines.push('# Best known lifts (use these to anchor loadPctOf1RM)');
  if (input.topSets.length === 0) {
    lines.push('- No lift history yet; use rpe-only prescriptions for all exercises.');
  } else {
    for (const t of input.topSets) lines.push(formatTopSet(t));
  }

  lines.push('');
  lines.push('# Available exercises (you MUST only use these IDs)');
  for (const e of input.exerciseLibrary) lines.push(formatLibraryEntry(e));

  lines.push('');
  lines.push('# Output');
  lines.push('Return JSON matching GeneratedProgramSchema. Nothing else.');

  return { system: SYSTEM_PROMPT, user: lines.join('\n') };
}

function formatSecondarySports(sports: SecondarySport[]): string {
  if (sports.length === 0) return 'none';
  return sports
    .map((s) => `${s.type} ${s.sessionsPerWeek}x/week ${s.avgDurationMinutes}min`)
    .join(', ');
}

function formatNullable<T>(v: T | null, fmt: (v: T) => string): string {
  return v === null ? 'unknown' : fmt(v);
}

function formatACWR(acwr: number | null): string {
  if (acwr === null) return 'unknown';
  const tag = acwr > 1.5 ? 'high risk' : acwr > 1.3 ? 'elevated' : 'ok';
  return `${acwr.toFixed(2)} (${tag})`;
}

function formatTopSet(t: CoachTopSet): string {
  return `- ${t.exerciseName} [${t.exerciseId}]: ${t.bestWeightKg}kg x ${t.bestReps}, est 1RM ${Math.round(t.estimated1RMKg)}kg`;
}

function formatLibraryEntry(e: CoachExerciseLibraryEntry): string {
  return `- ${e.id}: ${e.name} - ${e.muscleGroups.join('/')} (${e.equipment})`;
}
