import { AgentOSLogo } from './logo';

/** Branded preloader — shown briefly while the session verifies (§42). */
export function Preloader() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col items-center gap-5">
        <div className="preloader-mark">
          <AgentOSLogo size={40} />
        </div>
        <div className="h-[3px] w-44 overflow-hidden rounded-full" style={{ background: 'var(--bg-soft)' }}>
          <div className="preloader-bar h-full w-16 rounded-full" style={{ background: 'var(--accent)' }} />
        </div>
        <div className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
          AI Employees for Your Digital Agency
        </div>
      </div>
    </div>
  );
}
