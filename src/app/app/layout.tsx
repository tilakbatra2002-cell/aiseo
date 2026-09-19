'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Preloader } from '@/components/preloader';
import { api } from '@/lib/api-client';

interface Me { user: { name: string; email: string; role: string }; organization: { name: string } }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // small branded loading experience on entry
    const started = Date.now();
    api<Me>('/api/auth/me')
      .then((data) => {
        const wait = Math.max(0, 650 - (Date.now() - started));
        setTimeout(() => { if (!cancelled) setMe(data); }, wait);
      })
      .catch(async () => {
        if (!cancelled) {
          setFailed(true);
          // best-effort: clear any stale/invalid session cookie server-side
          // (prevents the /login ↔ /app redirect loop for bad cookies)
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
          if (!cancelled) router.replace('/login');
        }
      });
    return () => { cancelled = true; };
  }, [router]);

  if (failed) return null;
  if (!me) return <Preloader />;

  return (
    <div>
      <Sidebar userName={me.user.name} />
      <main className="min-h-screen pl-[232px]" style={{ background: 'var(--bg)' }}>
        <div className="mx-auto max-w-[1280px] px-7 py-7">{children}</div>
      </main>
    </div>
  );
}
