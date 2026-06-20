export function AuthUnavailable() {
  return (
    <div className="card mx-auto max-w-lg space-y-3 text-center">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text3)]">Demo mode</p>
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[var(--text)]">Wallet connection disabled</h1>
      <p className="text-[14px] text-[var(--text2)]">
        Public baskets and market views remain available. Portfolio, notifications, and live mirroring unlock when wallet auth is connected.
      </p>
    </div>
  );
}
