"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface BasketAsset {
  coin: string;
  weight: number;
  dex: string;
}

interface Basket {
  id: string;
  name: string;
  theme: string;
  description: string;
  basket_assets: BasketAsset[];
}

export default function BasketsPage() {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/baskets")
      .then((r) => r.json())
      .then((d) => setBaskets(d.baskets ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500">Loading baskets...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Curated baskets</h1>
      <div className="grid gap-4">
        {baskets.map((b) => (
          <div key={b.id} className="card space-y-3">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 className="text-lg font-semibold">{b.name}</h2>
                <p className="text-sm text-zinc-400">{b.description}</p>
              </div>
              <Link href={`/schedule/${b.id}`} className="btn text-sm no-underline shrink-0">
                Start DCA
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {b.basket_assets.map((a) => (
                <span
                  key={a.coin}
                  className="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
                >
                  {a.coin} {(Number(a.weight) * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
