'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '../../../../lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface CompletedSet {
  setIndex: number;
  reps: number;
  weight: number;
  rpe: number | null;
  heartRateAtCompletion: number | null;
}

interface ExerciseLogEntry {
  exerciseId: string;
  exercise: { name: string; muscleGroups: string[]; equipment: string };
  completedSets: CompletedSet[];
}

interface HeartRateSample {
  timestamp: string;
  bpm: number;
  zone: string;
}

interface WorkoutLogDetail {
  id: string;
  startedAt: string;
  completedAt: string | null;
  session: { name: string } | null;
  exerciseLogs: ExerciseLogEntry[];
  heartRateSamples: HeartRateSample[];
}

function formatDuration(start: string, end: string): string {
  const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}m ${secs}s`;
}

export default function WorkoutDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [log, setLog] = useState<WorkoutLogDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLog() {
      try {
        const res = await apiClient.get<WorkoutLogDetail>(`/workouts/logs/${params.id}`);
        setLog(res.data);
      } catch {
        // 404 or auth error
      } finally {
        setLoading(false);
      }
    }
    fetchLog();
  }, [params.id]);

  if (loading) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">Workout</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!log) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">Workout not found</h1>
        <button onClick={() => router.back()} className="text-sm text-brand-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const totalVolume = log.exerciseLogs.reduce(
    (sum, el) => sum + el.completedSets.reduce((s, set) => s + set.reps * set.weight, 0),
    0,
  );
  const totalSets = log.exerciseLogs.reduce((sum, el) => sum + el.completedSets.length, 0);

  const hrData = log.heartRateSamples.map((s, i) => ({
    idx: i,
    bpm: s.bpm,
    time: new Date(s.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div>
      <button onClick={() => router.back()} className="mb-4 text-sm text-brand-600 hover:underline">
        &larr; Back to workouts
      </button>

      <h1 className="mb-1 text-2xl font-bold">{log.session?.name ?? 'Free workout'}</h1>
      <p className="text-sm text-gray-400">
        {new Date(log.startedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        {log.completedAt && ` \u2022 ${formatDuration(log.startedAt, log.completedAt)}`}
      </p>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Exercises</p>
          <p className="mt-1 text-xl font-semibold">{log.exerciseLogs.length}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total sets</p>
          <p className="mt-1 text-xl font-semibold">{totalSets}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total volume</p>
          <p className="mt-1 text-xl font-semibold">{totalVolume.toLocaleString()} kg</p>
        </div>
      </div>

      {/* HR chart */}
      {hrData.length > 0 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Heart rate</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={hrData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="bpm" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Exercise details */}
      <div className="mt-6 space-y-4">
        {log.exerciseLogs.map((el) => (
          <div key={el.exerciseId} className="rounded-xl bg-white p-5 shadow-sm">
            <p className="font-semibold">{el.exercise.name}</p>
            <p className="text-xs text-gray-400">
              {el.exercise.muscleGroups.map((mg) => mg.replace('_', ' ')).join(', ')} &middot; {el.exercise.equipment}
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1 font-medium">Set</th>
                  <th className="pb-1 font-medium">Reps</th>
                  <th className="pb-1 font-medium">Weight</th>
                  <th className="pb-1 font-medium">RPE</th>
                </tr>
              </thead>
              <tbody>
                {el.completedSets.map((set) => (
                  <tr key={set.setIndex} className="border-t border-gray-50">
                    <td className="py-1">{set.setIndex + 1}</td>
                    <td className="py-1">{set.reps}</td>
                    <td className="py-1">{set.weight} kg</td>
                    <td className="py-1">{set.rpe ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
