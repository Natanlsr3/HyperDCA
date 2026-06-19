# HyperDCA

Multi-tenant "smallcase for HyperLiquid": themed perp baskets with automated DCA.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres
- Privy auth + embedded wallet
- `@nktkas/hyperliquid` + viem
- Vercel deployment

## Setup

```bash
pnpm install
cp .env.example .env.local
# Fill in PRIVY_APP_SECRET, SUPABASE keys, etc.
pnpm dev
```

## Supabase

Project ref: `cbwaklyfwirkhjjhdevc`

```bash
supabase db push
```

## Phase 0 spike

```bash
pnpm phase0          # dry-run (default)
PHASE0_LIVE=1 pnpm phase0  # live test (requires wallet keys)
```

## Cron endpoints

- `POST /api/cron/run-dca` — DCA executor (every ~15m)
- `POST /api/cron/guardrail` — liquidation monitor

Both require `Authorization: Bearer $CRON_SECRET`.
