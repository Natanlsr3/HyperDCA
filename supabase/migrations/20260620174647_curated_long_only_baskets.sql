-- Curated long-only baskets (replaces the prior 3 curated baskets).
-- Simple-DCA only product: every basket is long-only, periodic-buy friendly.
--
-- Every asset fact below was verified against the live Hyperliquid info API on
-- 2026-06-20 (POST https://api.hyperliquid.xyz/info):
--   * native HyperCore perps  -> dex='',    collateral USDC, bare symbol (BTC).
--   * xyz HIP-3 perps          -> dex='xyz', collateral USDC (collateralToken 0),
--                                 symbol prefixed (xyz:NVDA). No USDH/swap.
--   * is_cross = NOT onlyIsolated, taken verbatim from the live `meta` flag.
--     (Reference doc margin-mode labels are unreliable: e.g. TSM/ASML/AVGO/AMD
--      are onlyIsolated on HL even though docs call them "Cross".)
--   * sz_decimals copied verbatim from the live `meta` (wrong values break orders).
-- Idempotent: clears curated (public, ownerless) baskets then reinserts.

begin;

delete from public.basket_assets
  where basket_id in (select id from public.baskets where owner_user_id is null);
delete from public.baskets where owner_user_id is null;

with new_baskets as (
  insert into public.baskets (owner_user_id, name, theme, description, is_public)
  values
    (null, 'Genesis Bluechips', 'crypto_majors', 'The crypto reserve sleeve - Bitcoin, Ethereum, Solana and HYPE: the largest, most liquid native perps on Hyperliquid.', true),
    (null, 'Big Tech & Gold', 'megacap_tech', 'Mega-cap tech (Nvidia, Microsoft, Alphabet, Amazon, Meta, Apple) with a gold anchor. All cross-margin xyz perps.', true),
    (null, 'Silicon Vanguard', 'semiconductors', 'End-to-end semiconductors: Nvidia, TSMC, ASML, Broadcom, AMD and Micron via xyz HIP-3 perps.', true),
    (null, 'Inflation & Hard Assets', 'commodities', 'Real-world store of value: gold, silver, copper, uranium, platinum and natural gas commodity perps.', true),
    (null, 'AI Infrastructure', 'ai_infra', 'AI build-out picks-and-shovels: Palantir, Nvidia, the semis ETF, Broadcom, Microsoft and DRAM memory.', true),
    (null, 'All-Weather', 'balanced', 'A balanced long-only core: gold, silver, S&P 500, Nvidia, plus DXY and JPY safe-haven sleeves.', true)
  returning id, name
)
insert into public.basket_assets
  (basket_id, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
select nb.id, a.coin, a.dex, a.weight, a.sz_decimals, a.collateral, a.swap_pair, a.is_cross
from new_baskets nb
join (
  values
    -- Genesis Bluechips (native HyperCore, USDC, cross)
    ('Genesis Bluechips', 'BTC',  '',    0.40, 5, 'USDC', null::text, true),
    ('Genesis Bluechips', 'ETH',  '',    0.25, 4, 'USDC', null::text, true),
    ('Genesis Bluechips', 'SOL',  '',    0.20, 2, 'USDC', null::text, true),
    ('Genesis Bluechips', 'HYPE', '',    0.15, 2, 'USDC', null::text, true),

    -- Big Tech & Gold (every leg cross-eligible on HL)
    ('Big Tech & Gold', 'xyz:NVDA',  'xyz', 0.18, 3, 'USDC', null::text, true),
    ('Big Tech & Gold', 'xyz:MSFT',  'xyz', 0.16, 3, 'USDC', null::text, true),
    ('Big Tech & Gold', 'xyz:GOOGL', 'xyz', 0.14, 3, 'USDC', null::text, true),
    ('Big Tech & Gold', 'xyz:AMZN',  'xyz', 0.12, 3, 'USDC', null::text, true),
    ('Big Tech & Gold', 'xyz:META',  'xyz', 0.12, 3, 'USDC', null::text, true),
    ('Big Tech & Gold', 'xyz:AAPL',  'xyz', 0.10, 3, 'USDC', null::text, true),
    ('Big Tech & Gold', 'xyz:GOLD',  'xyz', 0.18, 4, 'USDC', null::text, true),

    -- Silicon Vanguard (NVDA/MU cross; TSM/ASML/AVGO/AMD onlyIsolated)
    ('Silicon Vanguard', 'xyz:NVDA', 'xyz', 0.25, 3, 'USDC', null::text, true),
    ('Silicon Vanguard', 'xyz:TSM',  'xyz', 0.20, 3, 'USDC', null::text, false),
    ('Silicon Vanguard', 'xyz:ASML', 'xyz', 0.18, 3, 'USDC', null::text, false),
    ('Silicon Vanguard', 'xyz:AVGO', 'xyz', 0.15, 2, 'USDC', null::text, false),
    ('Silicon Vanguard', 'xyz:AMD',  'xyz', 0.12, 3, 'USDC', null::text, false),
    ('Silicon Vanguard', 'xyz:MU',   'xyz', 0.10, 3, 'USDC', null::text, true),

    -- Inflation & Hard Assets (GOLD/SILVER cross; rest onlyIsolated)
    ('Inflation & Hard Assets', 'xyz:GOLD',     'xyz', 0.30, 4, 'USDC', null::text, true),
    ('Inflation & Hard Assets', 'xyz:SILVER',   'xyz', 0.18, 2, 'USDC', null::text, true),
    ('Inflation & Hard Assets', 'xyz:COPPER',   'xyz', 0.15, 2, 'USDC', null::text, false),
    ('Inflation & Hard Assets', 'xyz:URANIUM',  'xyz', 0.15, 3, 'USDC', null::text, false),
    ('Inflation & Hard Assets', 'xyz:PLATINUM', 'xyz', 0.12, 4, 'USDC', null::text, false),
    ('Inflation & Hard Assets', 'xyz:NATGAS',   'xyz', 0.10, 1, 'USDC', null::text, false),

    -- AI Infrastructure (NVDA/MSFT cross; PLTR/SMH/AVGO/DRAM onlyIsolated)
    ('AI Infrastructure', 'xyz:PLTR', 'xyz', 0.22, 3, 'USDC', null::text, false),
    ('AI Infrastructure', 'xyz:NVDA', 'xyz', 0.20, 3, 'USDC', null::text, true),
    ('AI Infrastructure', 'xyz:SMH',  'xyz', 0.18, 3, 'USDC', null::text, false),
    ('AI Infrastructure', 'xyz:AVGO', 'xyz', 0.15, 2, 'USDC', null::text, false),
    ('AI Infrastructure', 'xyz:MSFT', 'xyz', 0.15, 3, 'USDC', null::text, true),
    ('AI Infrastructure', 'xyz:DRAM', 'xyz', 0.10, 1, 'USDC', null::text, false),

    -- All-Weather (GOLD/SP500/NVDA/SILVER cross; DXY/JPY onlyIsolated)
    ('All-Weather', 'xyz:GOLD',   'xyz', 0.30, 4, 'USDC', null::text, true),
    ('All-Weather', 'xyz:SP500',  'xyz', 0.25, 3, 'USDC', null::text, true),
    ('All-Weather', 'xyz:NVDA',   'xyz', 0.10, 3, 'USDC', null::text, true),
    ('All-Weather', 'xyz:DXY',    'xyz', 0.15, 2, 'USDC', null::text, false),
    ('All-Weather', 'xyz:JPY',    'xyz', 0.10, 2, 'USDC', null::text, false),
    ('All-Weather', 'xyz:SILVER', 'xyz', 0.10, 2, 'USDC', null::text, true)
) as a(bname, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
  on a.bname = nb.name;

commit;
