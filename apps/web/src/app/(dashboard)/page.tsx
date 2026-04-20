'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface DailyHealthRecord {
  id: string;
  date: string;
  steps: number | null;
  caloriesActive: number | null;
  caloriesTotal: number | null;
  heartRateResting: number | null;
  sleepDurationMinutes: number | null;
  sleepScore: number | null;
  recoveryScore: number | null;
  strainScore: number | null;
  hrvRmssd: number | null;
}

interface RecentWorkout {
  id: string;
  startedAt: string;
  completedAt: string | null;
  session: { name: string } | null;
  exerciseLogs: { exercise: { name: string }; completedSets: unknown[] }[];
}

interface RecentRun {
  id: string;
  startedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number | null;
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TodayPage() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState<DailyHealthRecord[]>([]);
  const [workouts, setWorkouts] = useState<RecentWorkout[]>([]);
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, workoutRes, runRes] = await Promise.all([
          apiClient.get<DailyHealthRecord[]>('/health'),
          apiClient.get<RecentWorkout[]>('/workouts/logs'),
          apiClient.get<RecentRun[]>('/runs'),
        ]);
        setHealth(healthRes.data);
        setWorkouts(workoutRes.data);
        setRuns(runRes.data);
      } catch {
        // Silently handle — user sees empty state
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const today = health[0];
  const stepsData = health
    .slice(0, 7)
    .reverse()
    .map((d) => ({
      day: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
      steps: d.steps ?? 0,
    }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Good day, {user?.name ?? 'athlete'}</h1>
      <p className="text-gray-500">Here is your overview for today.</p>

      {/* Today's stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Steps</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading ? '...' : today?.steps?.toLocaleString() ?? '—'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Active calories</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading ? '...' : today?.caloriesActive != null ? `${Math.round(today.caloriesActive)} kcal` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Resting HR</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading ? '...' : today?.heartRateResting != null ? `${today.heartRateResting} bpm` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Sleep</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading ? '...' : today?.sleepDurationMinutes != null ? formatSleep(today.sleepDurationMinutes) : '—'}
          </p>
        </div>
      </div>

      {/* Weekly steps chart */}
      {stepsData.length > 0 && (
        <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Steps — Last 7 days</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stepsData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="steps" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent workouts */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Recent workouts</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : workouts.length === 0 ? (
            <p className="text-sm text-gray-400">No workouts logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {workouts.slice(0, 5).map((w) => (
                <li key={w.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{w.session?.name ?? 'Free workout'}</p>
                    <p className="text-xs text-gray-400">{formatDate(w.startedAt)}</p>
                  </div>
                  <p className="text-sm text-gray-500">
                    {w.exerciseLogs.length} exercise{w.exerciseLogs.length !== 1 ? 's' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent runs */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Recent runs</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-gray-400">No runs logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {runs.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{(r.distanceMeters / 1000).toFixed(1)} km</p>
                    <p className="text-xs text-gray-400">{formatDate(r.startedAt)}</p>
                  </div>
                  <p className="text-sm text-gray-500">
                    {r.avgPaceSecondsPerKm != null ? `${formatPace(r.avgPaceSecondsPerKm)} /km` : '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
