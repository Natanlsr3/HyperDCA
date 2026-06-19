import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Smallcase for HyperLiquid
        </h1>
        <p className="text-zinc-400 text-lg max-w-2xl">
          Themed perpetual baskets with automated DCA, carry-cost transparency, and
          liquidation guardrails. Trade HIP-3 stocks and crypto in one schedule.
        </p>
        <div className="flex gap-3">
          <Link href="/baskets" className="btn no-underline inline-block">
            Browse baskets
          </Link>
          <Link
            href="/onboarding"
            className="inline-block px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 no-underline"
          >
            Get started
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {[
          { title: "Curated baskets", desc: "Semiconductor, Crypto Core, Commodities sleeves" },
          { title: "Smart DCA", desc: "Time-based + dip-buy strategies from a live bot" },
          { title: "Carry preview", desc: "Annualized funding as an expense ratio at your leverage" },
        ].map((f) => (
          <div key={f.title} className="card">
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-zinc-400">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
