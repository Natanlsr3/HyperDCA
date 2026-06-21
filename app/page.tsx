import Link from "next/link";

const steps = [
  {
    num: "01",
    title: "Pick a basket",
    desc: "Browse curated thematic strategies — semiconductors, crypto majors, commodities, and more.",
    icon: "M12 2 2 7l10 5 10-5-10-5Z",
  },
  {
    num: "02",
    title: "Set your DCA schedule",
    desc: "Choose an amount, interval, and leverage. The AI bot executes with smart timing and dip-buy logic.",
    icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    num: "03",
    title: "Track and adjust",
    desc: "Monitor carry costs, P&L, and liquidation guardrails from your portfolio dashboard in real time.",
    icon: "M3 3v18h18M7 16l4-4 4 4 6-8",
  },
];

const features = [
  {
    title: "8 curated baskets",
    desc: "Semiconductor, AI Infra, Crypto Core, Commodities and more — built by analysts, backed by data.",
    icon: "M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10",
  },
  {
    title: "Smart DCA engine",
    desc: "Time-based + intraday dip-buy strategies. The bot watches the market so you don't have to.",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547Z",
  },
  {
    title: "Carry-cost transparency",
    desc: "See annualized funding rates framed as an expense ratio — like an ETF, but for perpetuals.",
    icon: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  },
  {
    title: "Liquidation guardrails",
    desc: "Auto-monitoring at leverage > 1x. Position guards run every cycle to keep risk in check.",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016Z",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[960px]">
      {/* Hero */}
      <section className="pb-[36px] pt-[8px] text-center sm:pb-[48px] sm:pt-[16px]">
        <div className="mx-auto mb-[18px] grid h-[56px] w-[56px] place-items-center rounded-[14px] bg-[var(--accent)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 2 7l10 5 10-5-10-5Z" />
            <path d="m2 17 10 5 10-5" />
            <path d="m2 12 10 5 10-5" />
          </svg>
        </div>
        <h1 className="mb-[12px] text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] text-[var(--text)] sm:text-[40px] md:text-[48px]">
          Thematic baskets<br />on HyperLiquid
        </h1>
        <p className="mx-auto mb-[28px] max-w-[540px] text-[15px] leading-[1.6] text-[var(--text2)] sm:text-[17px]">
          Automated DCA into curated strategies — HIP-3 stocks and crypto in one schedule, with carry transparency and liquidation guardrails.
        </p>
        <div className="flex justify-center gap-[12px]">
          <Link href="/baskets" className="btn px-[20px] py-[11px] text-[14px] no-underline">
            Browse baskets
          </Link>
          <Link href="/onboarding" className="btn-secondary px-[20px] py-[11px] text-[14px] no-underline">
            Get started
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-[48px]">
        <h2 className="mb-[6px] text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">How it works</h2>
        <p className="mb-[28px] text-center text-[22px] font-bold tracking-[-0.02em] text-[var(--text)]">Three steps to automated investing</p>
        <div className="grid gap-[18px] md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="card relative overflow-hidden p-[24px]">
              <span className="absolute right-4 top-3 text-[48px] font-black leading-none text-[var(--surface3)]">{step.num}</span>
              <div className="mb-[14px] grid h-[40px] w-[40px] place-items-center rounded-[10px] bg-[var(--accentSoft)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={step.icon} />
                </svg>
              </div>
              <h3 className="mb-[6px] text-[15px] font-bold text-[var(--text)]">{step.title}</h3>
              <p className="m-0 text-[13.5px] leading-[1.5] text-[var(--text2)]">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mb-[48px]">
        <h2 className="mb-[6px] text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">Features</h2>
        <p className="mb-[28px] text-center text-[22px] font-bold tracking-[-0.02em] text-[var(--text)]">Built for serious DCA investors</p>
        <div className="grid gap-[18px] md:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="card flex gap-[16px] p-[22px]">
              <div className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[10px] bg-[var(--accentSoft)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.icon} />
                </svg>
              </div>
              <div>
                <h3 className="mb-[4px] text-[15px] font-bold text-[var(--text)]">{f.title}</h3>
                <p className="m-0 text-[13.5px] leading-[1.5] text-[var(--text2)]">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mb-[24px] rounded-[14px] border border-[var(--border)] bg-gradient-to-b from-white to-[var(--surface2)] px-[20px] py-[28px] text-center shadow-[var(--shadow)] sm:p-[36px]">
        <h2 className="mb-[8px] text-[22px] font-bold tracking-[-0.02em] text-[var(--text)]">Ready to start?</h2>
        <p className="mx-auto mb-[20px] max-w-[420px] text-[15px] text-[var(--text2)]">
          Connect your wallet, pick a basket, and let the DCA bot handle the rest.
        </p>
        <Link href="/onboarding" className="btn px-[24px] py-[12px] text-[14px] no-underline">
          Create your account
        </Link>
      </section>
    </div>
  );
}
