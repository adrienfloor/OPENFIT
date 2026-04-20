'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface HeartRateSample {
  timestamp: string;
  bpm: number;
  zone: string;
}

interface GPSPoint {
  lat: number;
  lng: number;
  altitudeMeters: number;
  timestamp: string;
  speedMps: number;
}

interface RunSession {
  id: string;
  startedAt: string;
  completedAt: string | null;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number | null;
  bestPaceSecondsPerKm: number | null;
  elevationGainMeters: number;
  gpsPoints: GPSPoint[];
  heartRateSamples: HeartRateSample[];
}

function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSession[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await apiClient.get<RunSession[]>('/runs');
        setRuns(res.data);
      } catch {
        // empty state
      } finally {
        setLoading(false);
      }
    }
    fetchRuns();
  }, []);

  // Pace trend across runs
  const paceTrend = runs
    .filter((r) => r.avgPaceSecondsPerKm != null)
    .slice(0, 15)
    .reverse()
    .map((r) => ({
      date: new Date(r.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      pace: r.avgPaceSecondsPerKm!,
      paceLabel: formatPace(r.avgPaceSecondsPerKm!),
      distance: +(r.distanceMeters / 1000).toFixed(1),
    }));

  // Distance per run
  const distanceData = runs
    .slice(0, 15)
    .reverse()
    .map((r) => ({
      date: new Date(r.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      km: +(r.distanceMeters / 1000).toFixed(1),
    }));

  // HR data for selected run
  const hrData = selectedRun?.heartRateSamples.map((s, i) => ({
    idx: i,
    bpm: s.bpm,
    time: new Date(s.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  })) ?? [];

  // Elevation profile for selected run
  const elevationData = selectedRun?.gpsPoints.map((p, i) => ({
    idx: i,
    altitude: Math.round(p.altitudeMeters),
  })) ?? [];

  if (loading) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">Runs</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Runs</h1>

      {runs.length === 0 ? (
        <p className="text-sm text-gray-400">No runs logged yet.</p>
      ) : (
        <>
          {/* Trend charts */}
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {paceTrend.length > 1 && (
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold">Avg pace trend</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={paceTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      reversed
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => formatPace(v)}
                    />
                    <Tooltip formatter={(v: number) => [formatPace(v), 'Pace']} />
                    <Line type="monotone" dataKey="pace" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {distanceData.length > 1 && (
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold">Distance per run</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={distanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" km" />
                    <Tooltip />
                    <Area type="monotone" dataKey="km" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Selected run detail */}
          {selectedRun && (
            <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {(selectedRun.distanceMeters / 1000).toFixed(1)} km — {formatDate(selectedRun.startedAt)}
                </h2>
                <button onClick={() => setSelectedRun(null)} className="text-sm text-gray-400 hover:text-gray-600">
                  Close
                </button>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-500">Duration</p>
                  <p className="font-medium">{formatDuration(selectedRun.durationSeconds)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg pace</p>
                  <p className="font-medium">
                    {selectedRun.avgPaceSecondsPerKm != null ? `${formatPace(selectedRun.avgPaceSecondsPerKm)} /km` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Best pace</p>
                  <p className="font-medium">
                    {selectedRun.bestPaceSecondsPerKm != null ? `${formatPace(selectedRun.bestPaceSecondsPerKm)} /km` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Elevation</p>
                  <p className="font-medium">{selectedRun.elevationGainMeters} m</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {hrData.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-600">Heart rate</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={hrData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="bpm" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {elevationData.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-600">Elevation profile</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={elevationData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <YAxis tick={{ fontSize: 10 }} unit=" m" />
                        <Tooltip />
                        <Area type="monotone" dataKey="altitude" stroke="#f59e0b" fill="#fde68a" fillOpacity={0.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Run list */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Run history</h2>
            <div className="space-y-3">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`block w-full rounded-xl bg-white p-4 text-left shadow-sm transition hover:shadow-md ${selectedRun?.id === run.id ? 'ring-2 ring-brand-500' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{(run.distanceMeters / 1000).toFixed(1)} km</p>
                      <p className="text-xs text-gray-400">{formatDate(run.startedAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">{formatDuration(run.durationSeconds)}</p>
                      <p className="text-xs text-gray-400">
                        {run.avgPaceSecondsPerKm != null ? `${formatPace(run.avgPaceSecondsPerKm)} /km` : '—'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
