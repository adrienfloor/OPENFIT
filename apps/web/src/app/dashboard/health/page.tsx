'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
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
  effortScore: number | null;
  hrvRmssd: number | null;
}

type TimeRange = '7d' | '30d' | '90d';

function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
}

export default function HealthPage() {
  const [health, setHealth] = useState<DailyHealthRecord[]>([]);
  const [range, setRange] = useState<TimeRange>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await apiClient.get<DailyHealthRecord[]>('/health');
        setHealth(res.data);
      } catch {
        // empty state
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();
  }, []);

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const data = health.slice(0, days).reverse().map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    steps: d.steps,
    caloriesActive: d.caloriesActive != null ? Math.round(d.caloriesActive) : null,
    restingHR: d.heartRateResting,
    hrv: d.hrvRmssd != null ? Math.round(d.hrvRmssd) : null,
    sleepHours: d.sleepDurationMinutes != null ? +(d.sleepDurationMinutes / 60).toFixed(1) : null,
    sleepScore: d.sleepScore,
    recovery: d.recoveryScore,
    effort: d.effortScore,
  }));

  // Averages for the period
  const avg = (key: keyof typeof data[0]) => {
    const vals = data.map((d) => d[key]).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">Health</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Health</h1>
        <div className="flex gap-1 rounded-lg bg-white p-1 shadow-sm">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                range === r ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {health.length === 0 ? (
        <p className="text-sm text-gray-400">No health data synced yet.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Avg steps', value: avg('steps')?.toLocaleString() ?? '—' },
              { label: 'Avg calories', value: avg('caloriesActive') != null ? `${avg('caloriesActive')} kcal` : '—' },
              { label: 'Avg resting HR', value: avg('restingHR') != null ? `${avg('restingHR')} bpm` : '—' },
              { label: 'Avg HRV', value: avg('hrv') != null ? `${avg('hrv')} ms` : '—' },
              { label: 'Avg sleep', value: avg('sleepHours') != null ? `${(avg('sleepHours')! / 1).toFixed(0)}h` : '—' },
              { label: 'Avg recovery', value: avg('recovery') != null ? `${avg('recovery')}%` : '—' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="mt-1 text-lg font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Steps */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Steps</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="steps" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Resting HR + HRV */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Resting HR &amp; HRV</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
                  <YAxis yAxisId="hr" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="hrv" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line yAxisId="hr" type="monotone" dataKey="restingHR" name="Resting HR" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="hrv" type="monotone" dataKey="hrv" name="HRV" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sleep */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Sleep duration</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
                  <YAxis tick={{ fontSize: 10 }} unit="h" />
                  <Tooltip formatter={(v: number) => [`${v}h`, 'Sleep']} />
                  <Bar dataKey="sleepHours" fill="#6366f1" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Recovery & Effort */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold">Recovery &amp; Effort</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="recovery" name="Recovery" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="effort" name="Effort" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Calories */}
            <div className="rounded-xl bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="mb-4 text-base font-semibold">Active calories</h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
                  <YAxis tick={{ fontSize: 10 }} unit=" kcal" />
                  <Tooltip />
                  <Area type="monotone" dataKey="caloriesActive" name="Active cal" stroke="#f59e0b" fill="#fde68a" fillOpacity={0.4} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
