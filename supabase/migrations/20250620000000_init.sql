-- HyperDCA MVP schema: 7 tables + RLS + curated basket seeds

create extension if not exists "pgcrypto";

-- ── users ──────────────────────────────────────────────────────────
create table public.users (
  id uuid primary key default gen_random_uuid(),
  privy_id text not null unique,
  email text,
  main_wallet text,
  builder_fee_approved boolean not null default false,
  guardrail_flagged boolean not null default false,
  guardrail_detail jsonb,
  created_at timestamptz not null default now()
);

-- ── agent_keys ─────────────────────────────────────────────────────
create table public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  agent_address text not null,
  encrypted_private_key bytea not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ── baskets ────────────────────────────────────────────────────────
create table public.baskets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null,
  name text not null,
  theme text not null,
  description text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── basket_assets ──────────────────────────────────────────────────
create table public.basket_assets (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.baskets(id) on delete cascade,
  coin text not null,
  dex text not null default '',
  weight numeric not null check (weight > 0),
  sz_decimals int not null,
  collateral text not null default 'USDC',
  swap_pair text,
  is_cross boolean not null default true,
  unique (basket_id, coin)
);

-- ── schedules ──────────────────────────────────────────────────────
create type public.schedule_status as enum ('active', 'paused', 'closed');
create type public.strategy_type as enum ('simple_time', 'price_drop');

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  basket_id uuid not null references public.baskets(id),
  amount_usd numeric not null check (amount_usd > 0),
  interval_seconds int not null check (interval_seconds >= 3600),
  leverage int not null default 1 check (leverage >= 1 and leverage <= 5),
  strategy_type public.strategy_type not null default 'simple_time',
  params jsonb not null default '{}'::jsonb,
  take_profit_pct numeric,
  stop_loss_pct numeric,
  status public.schedule_status not null default 'active',
  next_run_at timestamptz not null default now(),
  locked_until timestamptz,
  session_started_at timestamptz,
  created_at timestamptz not null default now()
);

create index schedules_due_idx on public.schedules (status, next_run_at)
  where status = 'active';

-- ── executions ─────────────────────────────────────────────────────
create type public.execution_status as enum ('success', 'partial', 'skipped', 'error');

create table public.executions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  ran_at timestamptz not null default now(),
  cycle_start timestamptz,
  status public.execution_status not null,
  detail jsonb not null default '{}'::jsonb
);

-- ── orders ─────────────────────────────────────────────────────────
create type public.order_status as enum ('pending', 'filled', 'error', 'skipped');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.executions(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  coin text not null,
  dex text not null default '',
  cloid text not null unique,
  requested_usd numeric not null,
  status public.order_status not null default 'pending',
  fill_px numeric,
  fill_sz numeric,
  notional numeric,
  error text,
  created_at timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.agent_keys enable row level security;
alter table public.baskets enable row level security;
alter table public.basket_assets enable row level security;
alter table public.schedules enable row level security;
alter table public.executions enable row level security;
alter table public.orders enable row level security;

-- Public read for curated baskets
create policy "Public baskets readable" on public.baskets
  for select using (is_public = true or owner_user_id is null);

create policy "Basket assets readable for public baskets" on public.basket_assets
  for select using (
    exists (
      select 1 from public.baskets b
      where b.id = basket_id and (b.is_public = true or b.owner_user_id is null)
    )
  );

-- Service role bypasses RLS; user-scoped policies for authenticated access via JWT custom claims
create policy "Users read own row" on public.users
  for select using (privy_id = current_setting('request.jwt.claims', true)::json->>'sub');

create policy "Users read own agent key metadata" on public.agent_keys
  for select using (
    user_id in (select id from public.users where privy_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

create policy "Users manage own schedules" on public.schedules
  for all using (
    user_id in (select id from public.users where privy_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

create policy "Users read own executions" on public.executions
  for select using (
    user_id in (select id from public.users where privy_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

create policy "Users read own orders" on public.orders
  for select using (
    schedule_id in (
      select s.id from public.schedules s
      join public.users u on u.id = s.user_id
      where u.privy_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- ── Seed 3 curated baskets ─────────────────────────────────────────

insert into public.baskets (name, theme, description, is_public) values
  (
    'Semiconductor Sleeve',
    'semiconductor',
    'HIP-3 exposure to chipmakers and semi ecosystem via MAG7 and SK Hynix.',
    true
  ),
  (
    'Crypto Core',
    'crypto',
    'Large-cap crypto perpetuals: BTC, ETH, SOL, HYPE.',
    true
  ),
  (
    'Commodities Basket',
    'commodities',
    'TradFi commodity perps: copper and related HIP-3 legs.',
    true
  );

-- Semiconductor: MAG7 + SKHX
insert into public.basket_assets (basket_id, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
select b.id, v.coin, v.dex, v.weight, v.sz_decimals, v.collateral, v.swap_pair, v.is_cross
from public.baskets b,
(values
  ('vntl:MAG7', 'vntl', 0.6, 3, 'USDH', '@230', false),
  ('xyz:SKHX', 'xyz', 0.4, 3, 'USDH', '@230', false)
) as v(coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
where b.theme = 'semiconductor';

-- Crypto Core
insert into public.basket_assets (basket_id, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
select b.id, v.coin, v.dex, v.weight, v.sz_decimals, v.collateral, v.swap_pair, v.is_cross
from public.baskets b,
(values
  ('BTC', '', 0.35, 5, 'USDC', null, true),
  ('ETH', '', 0.25, 4, 'USDC', null, true),
  ('SOL', '', 0.25, 2, 'USDC', null, true),
  ('HYPE', '', 0.15, 2, 'USDC', null, true)
) as v(coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
where b.theme = 'crypto';

-- Commodities
insert into public.basket_assets (basket_id, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
select b.id, v.coin, v.dex, v.weight, v.sz_decimals, v.collateral, v.swap_pair, v.is_cross
from public.baskets b,
(values
  ('xyz:COPPER', 'xyz', 0.55, 2, 'USDH', '@230', false),
  ('xyz:SNDK', 'xyz', 0.45, 3, 'USDH', '@230', false)
) as v(coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
where b.theme = 'commodities';

-- pg_cron jobs (run after deploy — calls Vercel cron endpoints)
-- Uncomment and set your Vercel URL + CRON_SECRET after deployment:
-- select cron.schedule('run-dca', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://your-app.vercel.app/api/cron/run-dca',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);
-- select cron.schedule('guardrail', '*/30 * * * *', $$
--   select net.http_post(
--     url := 'https://your-app.vercel.app/api/cron/guardrail',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);
