'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface Exercise {
  id: string;
  name: string;
  muscleGroups: string[];
  equipment: string;
}

interface CompletedSet {
  setIndex: number;
  reps: number;
  weight: number;
  rpe: number | null;
}

interface ExerciseLogEntry {
  exerciseId: string;
  exercise: Exercise;
  completedSets: CompletedSet[];
}

interface WorkoutLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  session: { name: string } | null;
  exerciseLogs: ExerciseLogEntry[];
}

interface Program {
  id: string;
  name: string;
  weeks: {
    weekNumber: number;
    sessions: {
      name: string;
      plannedExercises: { exercise: Exercise }[];
    }[];
  }[];
}

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  shoulders: '#f59e0b',
  biceps: '#8b5cf6',
  triceps: '#ec4899',
  core: '#14b8a6',
  quads: '#22c55e',
  hamstrings: '#06b6d4',
  glutes: '#f97316',
  calves: '#6366f1',
  forearms: '#a855f7',
  full_body: '#64748b',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMuscleGroup(mg: string): string {
  return mg.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WorkoutsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [progRes, logRes] = await Promise.all([
          apiClient.get<Program[]>('/workouts/programs'),
          apiClient.get<WorkoutLog[]>('/workouts/logs'),
        ]);
        setPrograms(progRes.data);
        setLogs(logRes.data);
      } catch {
        // empty state on error
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Volume per workout (total sets)
  const volumeData = logs
    .slice(0, 10)
    .reverse()
    .map((log) => {
      const totalSets = log.exerciseLogs.reduce((sum, el) => sum + el.completedSets.length, 0);
      return {
        date: new Date(log.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sets: totalSets,
      };
    });

  // Muscle group distribution across all logged workouts
  const muscleCount: Record<string, number> = {};
  for (const log of logs) {
    for (const el of log.exerciseLogs) {
      for (const mg of el.exercise.muscleGroups) {
        muscleCount[mg] = (muscleCount[mg] ?? 0) + el.completedSets.length;
      }
    }
  }
  const muscleData = Object.entries(muscleCount)
    .map(([name, value]) => ({ name: formatMuscleGroup(name), value, key: name }))
    .sort((a, b) => b.value - a.value);

  if (loading) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">Workouts</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Workouts</h1>

      {/* Programs */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Programs</h2>
          <Link
            href="/dashboard/workouts/new"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Create program
          </Link>
        </div>
        {programs.length === 0 ? (
          <p className="text-sm text-gray-400">No programs created yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => {
              const totalSessions = p.weeks.reduce((sum, w) => sum + w.sessions.length, 0);
              return (
                <div key={p.id} className="rounded-xl bg-white p-5 shadow-sm">
                  <p className="text-base font-semibold">{p.name}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {p.weeks.length} week{p.weeks.length !== 1 ? 's' : ''} &middot; {totalSessions} session{totalSessions !== 1 ? 's' : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Charts */}
      {logs.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Volume chart */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Volume — Last 10 workouts</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'Sets', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                <Tooltip />
                <Bar dataKey="sets" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Muscle group distribution */}
          {muscleData.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Muscle group distribution</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={muscleData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {muscleData.map((entry) => (
                      <Cell key={entry.key} fill={MUSCLE_COLORS[entry.key] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Workout history */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Workout history</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">No workouts logged yet.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const totalSets = log.exerciseLogs.reduce((sum, el) => sum + el.completedSets.length, 0);
              const totalVolume = log.exerciseLogs.reduce(
                (sum, el) => sum + el.completedSets.reduce((s, set) => s + set.reps * set.weight, 0),
                0,
              );
              return (
                <Link
                  key={log.id}
                  href={`/dashboard/workouts/${log.id}`}
                  className="block rounded-xl bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{log.session?.name ?? 'Free workout'}</p>
                      <p className="text-xs text-gray-400">{formatDate(log.startedAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{totalSets} sets</p>
                      <p className="text-xs text-gray-400">{totalVolume.toLocaleString()} kg total</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
