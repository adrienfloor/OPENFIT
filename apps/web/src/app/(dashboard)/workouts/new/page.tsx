'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api';

interface Exercise {
  id: string;
  name: string;
  muscleGroups: string[];
  equipment: string;
}

interface PlannedSetInput {
  reps: string;
  weight: string;
  rpe: string;
  restSeconds: string;
}

interface PlannedExerciseInput {
  exerciseId: string;
  exerciseName: string;
  sets: PlannedSetInput[];
}

interface SessionInput {
  name: string;
  exercises: PlannedExerciseInput[];
}

interface WeekInput {
  weekNumber: number;
  sessions: SessionInput[];
}

function emptySet(): PlannedSetInput {
  return { reps: '8', weight: '', rpe: '', restSeconds: '90' };
}

function emptyExercise(): PlannedExerciseInput {
  return { exerciseId: '', exerciseName: '', sets: [emptySet()] };
}

function emptySession(name = ''): SessionInput {
  return { name, exercises: [emptyExercise()] };
}

function emptyWeek(weekNumber: number): WeekInput {
  return { weekNumber, sessions: [emptySession('Day 1')] };
}

export default function NewProgramPage() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programName, setProgramName] = useState('');
  const [weeks, setWeeks] = useState<WeekInput[]>([emptyWeek(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiClient.get<Exercise[]>('/workouts/exercises').then((res) => { setExercises(res.data); }).catch(() => {});
  }, []);

  // Week helpers
  const addWeek = () => setWeeks([...weeks, emptyWeek(weeks.length + 1)]);
  const removeWeek = (wi: number) => {
    if (weeks.length <= 1) return;
    setWeeks(weeks.filter((_, i) => i !== wi).map((w, i) => ({ ...w, weekNumber: i + 1 })));
  };

  // Session helpers
  const addSession = (wi: number) => {
    const updated = [...weeks];
    const sessionNum = updated[wi]!.sessions.length + 1;
    updated[wi]!.sessions.push(emptySession(`Day ${sessionNum}`));
    setWeeks(updated);
  };
  const removeSession = (wi: number, si: number) => {
    const updated = [...weeks];
    if (updated[wi]!.sessions.length <= 1) return;
    updated[wi]!.sessions.splice(si, 1);
    setWeeks(updated);
  };
  const updateSessionName = (wi: number, si: number, name: string) => {
    const updated = [...weeks];
    updated[wi]!.sessions[si]!.name = name;
    setWeeks(updated);
  };

  // Exercise helpers
  const addExercise = (wi: number, si: number) => {
    const updated = [...weeks];
    updated[wi]!.sessions[si]!.exercises.push(emptyExercise());
    setWeeks(updated);
  };
  const removeExercise = (wi: number, si: number, ei: number) => {
    const updated = [...weeks];
    const exs = updated[wi]!.sessions[si]!.exercises;
    if (exs.length <= 1) return;
    exs.splice(ei, 1);
    setWeeks(updated);
  };
  const selectExercise = (wi: number, si: number, ei: number, ex: Exercise) => {
    const updated = [...weeks];
    updated[wi]!.sessions[si]!.exercises[ei]!.exerciseId = ex.id;
    updated[wi]!.sessions[si]!.exercises[ei]!.exerciseName = ex.name;
    setWeeks(updated);
  };

  // Set helpers
  const addSet = (wi: number, si: number, ei: number) => {
    const updated = [...weeks];
    updated[wi]!.sessions[si]!.exercises[ei]!.sets.push(emptySet());
    setWeeks(updated);
  };
  const removeSet = (wi: number, si: number, ei: number, setIdx: number) => {
    const updated = [...weeks];
    const sets = updated[wi]!.sessions[si]!.exercises[ei]!.sets;
    if (sets.length <= 1) return;
    sets.splice(setIdx, 1);
    setWeeks(updated);
  };
  const updateSet = (wi: number, si: number, ei: number, setIdx: number, field: keyof PlannedSetInput, value: string) => {
    const updated = [...weeks];
    updated[wi]!.sessions[si]!.exercises[ei]!.sets[setIdx]![field] = value;
    setWeeks(updated);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!programName.trim()) {
      setError('Program name is required.');
      return;
    }

    // Validate all exercises are selected
    for (const week of weeks) {
      for (const session of week.sessions) {
        if (!session.name.trim()) {
          setError('All sessions must have a name.');
          return;
        }
        for (const ex of session.exercises) {
          if (!ex.exerciseId) {
            setError('All exercises must be selected.');
            return;
          }
          for (const set of ex.sets) {
            if (!set.reps || parseInt(set.reps, 10) <= 0) {
              setError('All sets must have valid reps.');
              return;
            }
          }
        }
      }
    }

    const payload = {
      name: programName.trim(),
      weeks: weeks.map((week) => ({
        weekNumber: week.weekNumber,
        sessions: week.sessions.map((session) => ({
          name: session.name.trim(),
          exercises: session.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets.map((set) => ({
              reps: parseInt(set.reps, 10),
              weight: set.weight ? parseFloat(set.weight) : undefined,
              rpe: set.rpe ? parseFloat(set.rpe) : undefined,
              restSeconds: parseInt(set.restSeconds, 10) || 90,
            })),
          })),
        })),
      })),
    };

    setSubmitting(true);
    try {
      await apiClient.post('/workouts/programs', payload);
      router.push('/dashboard/workouts');
    } catch (err) {
      setError('Failed to create program. Check your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="mb-4 text-sm text-brand-600 hover:underline">
        &larr; Back to workouts
      </button>

      <h1 className="mb-6 text-2xl font-bold">Create Program</h1>

      {/* Program name */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">Program name</label>
        <input
          type="text"
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="e.g. Push/Pull/Legs"
        />
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Week {week.weekNumber}</h2>
            {weeks.length > 1 && (
              <button onClick={() => removeWeek(wi)} className="text-xs text-red-500 hover:underline">
                Remove week
              </button>
            )}
          </div>

          {/* Sessions */}
          {week.sessions.map((session, si) => (
            <div key={si} className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-3">
                <input
                  type="text"
                  value={session.name}
                  onChange={(e) => updateSessionName(wi, si, e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                  placeholder="Session name"
                />
                {week.sessions.length > 1 && (
                  <button onClick={() => removeSession(wi, si)} className="text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                )}
              </div>

              {/* Exercises */}
              {session.exercises.map((ex, ei) => (
                <div key={ei} className="mb-3 rounded-md border border-gray-200 bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={ex.exerciseId}
                      onChange={(e) => {
                        const found = exercises.find((x) => x.id === e.target.value);
                        if (found) selectExercise(wi, si, ei, found);
                      }}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">Select exercise...</option>
                      {exercises.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.muscleGroups.join(', ')})
                        </option>
                      ))}
                    </select>
                    {session.exercises.length > 1 && (
                      <button onClick={() => removeExercise(wi, si, ei)} className="text-xs text-red-500 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Sets */}
                  <div className="space-y-1.5">
                    {ex.sets.map((set, setIdx) => (
                      <div key={setIdx} className="flex items-center gap-2">
                        <span className="w-10 text-xs text-gray-400">Set {setIdx + 1}</span>
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) => updateSet(wi, si, ei, setIdx, 'reps', e.target.value)}
                          className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-sm"
                          placeholder="Reps"
                        />
                        <span className="text-xs text-gray-400">reps</span>
                        <input
                          type="number"
                          value={set.weight}
                          onChange={(e) => updateSet(wi, si, ei, setIdx, 'weight', e.target.value)}
                          className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-sm"
                          placeholder="kg"
                        />
                        <span className="text-xs text-gray-400">kg</span>
                        <input
                          type="number"
                          value={set.rpe}
                          onChange={(e) => updateSet(wi, si, ei, setIdx, 'rpe', e.target.value)}
                          className="w-14 rounded border border-gray-200 px-2 py-1 text-center text-sm"
                          placeholder="RPE"
                        />
                        <input
                          type="number"
                          value={set.restSeconds}
                          onChange={(e) => updateSet(wi, si, ei, setIdx, 'restSeconds', e.target.value)}
                          className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-sm"
                          placeholder="Rest"
                        />
                        <span className="text-xs text-gray-400">s rest</span>
                        {ex.sets.length > 1 && (
                          <button onClick={() => removeSet(wi, si, ei, setIdx)} className="text-xs text-red-400 hover:text-red-600">
                            x
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addSet(wi, si, ei)}
                    className="mt-2 text-xs text-brand-600 hover:underline"
                  >
                    + Add set
                  </button>
                </div>
              ))}

              <button
                onClick={() => addExercise(wi, si)}
                className="mt-1 text-sm text-brand-600 hover:underline"
              >
                + Add exercise
              </button>
            </div>
          ))}

          <button
            onClick={() => addSession(wi)}
            className="text-sm text-brand-600 hover:underline"
          >
            + Add session
          </button>
        </div>
      ))}

      <button
        onClick={addWeek}
        className="mb-6 text-sm font-medium text-brand-600 hover:underline"
      >
        + Add week
      </button>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Program'}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
