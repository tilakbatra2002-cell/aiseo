'use client';

import { AgentOSLogo } from '@/components/logo';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md text-center">
        <div className="mb-5 flex justify-center"><AgentOSLogo size={36} /></div>
        <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
          The operation couldn&apos;t be completed. No agents were harmed — and nothing was reported as complete that didn&apos;t actually complete.
        </p>
        {error?.digest && <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>Reference: {error.digest}</p>}
        <button className="btn-primary mt-5" onClick={reset}>Try again</button>
        <div className="mt-6 text-[11px] font-semibold" style={{ color: 'var(--text-3)' }}>Webamazee AgentOS — AI Employees for Your Digital Agency</div>
      </div>
    </div>
  );
}
