'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { RegisterInputSchema } from '@openfit/types';
import type { AuthTokens, UserProfile } from '@openfit/types';

export default function RegisterPage() {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    dateOfBirth: '',
    weightKg: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = RegisterInputSchema.safeParse({
      ...form,
      weightKg: Number(form.weightKg),
      dateOfBirth: new Date(form.dateOfBirth),
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post<AuthTokens & { user: UserProfile }>('/auth/register', parsed.data);
      setTokens(res.data, res.data.user);
      router.push('/dashboard');
    } catch {
      setError('Registration failed. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  }

  const fields: Array<{ id: string; label: string; type: string; placeholder?: string }> = [
    { id: 'name', label: 'Full name', type: 'text' },
    { id: 'email', label: 'Email', type: 'email' },
    { id: 'password', label: 'Password', type: 'password', placeholder: 'Min 8 chars, 1 uppercase, 1 number' },
    { id: 'dateOfBirth', label: 'Date of birth', type: 'date' },
    { id: 'weightKg', label: 'Weight (kg)', type: 'number' },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center py-12">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-md">
        <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {fields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-sm font-medium" htmlFor={f.id}>
                {f.label}
              </label>
              <input
                id={f.id}
                type={f.type}
                value={form[f.id as keyof typeof form]}
                onChange={(e) => update(f.id, e.target.value)}
                placeholder={f.placeholder}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <a href="/login" className="text-brand-600 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
