-- HyperDCA Baskets Agent integration.
-- Adds public basket analytics, follow/mirror state, notifications, and audit logs.

begin;

alter table public.users
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_username text,
  add column if not exists is_admin boolean not null default false;

alter table public.baskets
  add column if not exists is_testnet boolean not null default false,
  add column if not exists roi_30d numeric not null default 0,
  add column if not exists roi_ytd numeric not null default 0,
  add column if not exists hit_rate numeric not null default 0.5,
  add column if not exists followers_count integer not null default 0,
  add column if not exists total_trades integer not null default 0,
  add column if not exists last_rebalance timestamptz;

create index if not exists idx_baskets_public_roi
  on public.baskets (is_public, is_testnet, roi_30d desc);

create table if not exists public.basket_followers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  basket_id uuid not null references public.baskets(id) on delete cascade,
  follow_mode text not null default 'manual' check (follow_mode in ('manual', 'auto')),
  follower_roi numeric not null default 0,
  trades_mirrored integer not null default 0,
  mirror_count integer not null default 0,
  telegram_notified boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, basket_id)
);

create table if not exists public.basket_changes (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.baskets(id) on delete cascade,
  changed_by_user_id uuid references public.users(id) on delete set null,
  old_composition jsonb not null default '[]'::jsonb,
  new_composition jsonb not null default '[]'::jsonb,
  change_timestamp timestamptz not null default now(),
  users_notified_count integer not null default 0,
  users_who_mirrored text[] not null default array[]::text[]
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  basket_id uuid references public.baskets(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  telegram_message_id integer,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mirror_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  basket_id uuid not null references public.baskets(id) on delete cascade,
  old_composition jsonb not null default '[]'::jsonb,
  new_composition jsonb not null default '[]'::jsonb,
  trades_executed jsonb not null default '[]'::jsonb,
  total_slippage numeric,
  execution_time timestamptz not null default now(),
  success boolean not null default true,
  error_message text
);

create index if not exists idx_basket_followers_user on public.basket_followers (user_id);
create index if not exists idx_basket_followers_basket on public.basket_followers (basket_id);
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_mirror_executions_user_created on public.mirror_executions (user_id, execution_time desc);

alter table public.basket_followers enable row level security;
alter table public.basket_changes enable row level security;
alter table public.notifications enable row level security;
alter table public.mirror_executions enable row level security;

drop policy if exists "Users see own followers" on public.basket_followers;
create policy "Users see own followers" on public.basket_followers
  for select using (
    user_id in (select id from public.users where privy_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

drop policy if exists "Users see own notifications" on public.notifications;
create policy "Users see own notifications" on public.notifications
  for select using (
    user_id in (select id from public.users where privy_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

drop policy if exists "Users see own executions" on public.mirror_executions;
create policy "Users see own executions" on public.mirror_executions
  for select using (
    user_id in (select id from public.users where privy_id = current_setting('request.jwt.claims', true)::json->>'sub')
  );

drop policy if exists "Public basket changes readable" on public.basket_changes;
create policy "Public basket changes readable" on public.basket_changes
  for select using (
    exists (select 1 from public.baskets b where b.id = basket_id and b.is_public = true)
  );

commit;
