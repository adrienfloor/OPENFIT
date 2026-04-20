'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, clearAuth, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-56 shrink-0 flex-col border-r bg-white px-4 py-6">
        <p className="mb-6 text-lg font-bold text-brand-600">OpenFit</p>
        <ul className="space-y-1">
          {[
            { href: '/dashboard', label: 'Today' },
            { href: '/dashboard/workouts', label: 'Workouts' },
            { href: '/dashboard/runs', label: 'Runs' },
            { href: '/dashboard/health', label: 'Health' },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t pt-4">
          <p className="mb-2 truncate px-3 text-xs text-gray-400">{user?.email}</p>
          <button
            onClick={() => { clearAuth(); router.push('/login'); }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Log out
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
