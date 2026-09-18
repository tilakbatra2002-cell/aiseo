export function AgentOSLogo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="grid place-items-center rounded-lg text-white"
        style={{ width: size, height: size, background: 'var(--accent)' }}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
          <path d="M12 8v8M8 10v4M16 10v4" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
          Webamazee <span style={{ color: 'var(--accent)' }}>AgentOS</span>
        </span>
      </span>
    </span>
  );
}
