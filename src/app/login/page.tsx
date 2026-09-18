'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AgentOSLogo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@webamazee.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Login failed');
      router.replace('/app/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ background: 'var(--bg-soft)' }}>
      <div className="w-full max-w-[400px]">
        <div className="panel p-8">
          <div className="mb-6 flex items-center justify-between">
            <AgentOSLogo size={30} />
            <ThemeToggle compact />
          </div>
          <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Welcome back</h1>
          <p className="mb-6 mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
            Sign in to manage your AI workforce.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••••••" />
            </div>
            {error && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626', background: 'rgba(239,68,68,0.06)' }}>{error}</div>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="mt-4 rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'var(--bg-soft)', color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--text)' }}>Demo access</b> — owner@webamazee.com · password: <code className="font-bold" style={{ color: 'var(--accent)' }}>Agent0s!Demo123</code>
            <br />First run? The demo workspace seeds itself automatically.
          </div>
          <div className="mt-4 text-center text-sm" style={{ color: 'var(--text-2)' }}>
            New agency? <Link href="/signup" className="link font-semibold">Create your workspace</Link>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
          Webamazee AgentOS — AI Employees for Your Digital Agency
        </p>
      </div>
    </div>
  );
}
