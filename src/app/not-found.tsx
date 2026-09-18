import Link from 'next/link';
import { AgentOSLogo } from '@/components/logo';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md text-center">
        <div className="mb-5 flex justify-center"><AgentOSLogo size={36} /></div>
        <h1 className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>Page not found</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-2)' }}>
          This route doesn&apos;t exist in your agency workspace.
        </p>
        <Link href="/app/dashboard" className="btn-primary mt-5 inline-flex">Back to Command Center</Link>
        <div className="mt-6 text-[11px] font-semibold" style={{ color: 'var(--text-3)' }}>Webamazee AgentOS</div>
      </div>
    </div>
  );
}
