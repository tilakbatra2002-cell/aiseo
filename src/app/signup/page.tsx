'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AgentOSLogo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', agencyName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Signup failed');
      router.replace('/app/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10" style={{ background: 'var(--bg-soft)' }}>
      <div className="w-full max-w-[420px]">
        <div className="panel p-8">
          <div className="mb-6 flex items-center justify-between">
            <AgentOSLogo size={30} />
            <ThemeToggle compact />
          </div>
          <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Build your AI workforce</h1>
          <p className="mb-6 mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
            Your agency gets a full AI SEO department — Team Head + 12 specialist employees.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Agency name</label>
              <input className="input" value={form.agencyName} onChange={set('agencyName')} required placeholder="e.g. Webamazee" />
            </div>
            <div>
              <label className="label">Your name</label>
              <input className="input" value={form.name} onChange={set('name')} required placeholder="Agency Owner" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} minLength={8} required placeholder="Minimum 8 characters" />
            </div>
            {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626', background: 'rgba(239,68,68,0.06)' }}>{error}</div>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? 'Creating workspace…' : 'Create workspace'}</button>
          </form>
          <div className="mt-4 text-center text-sm" style={{ color: 'var(--text-2)' }}>
            Already have a workspace? <Link href="/login" className="link font-semibold">Sign in</Link>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
          Webamazee AgentOS — AI Employees for Your Digital Agency
        </p>
      </div>
    </div>
  );
}
