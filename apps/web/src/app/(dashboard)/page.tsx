'use client';

import { useAuthStore } from '../../stores/auth.store';

export default function TodayPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Good day, {user?.name ?? 'athlete'}</h1>
      <p className="text-gray-500">Here is your overview for today.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Steps', value: '—' },
          { label: 'Active calories', value: '—' },
          { label: 'Resting HR', value: '—' },
          { label: 'Sleep', value: '—' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
