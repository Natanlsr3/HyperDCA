-- HyperDCA curated default baskets (idempotent).
-- Replaces the 3 placeholder baskets with 3 themed baskets spanning HyperLiquid's
-- asset classes via HyperCore (main dex) + HIP-3 (xyz dex).
--
-- Asset facts verified against the HL info API on 2026-06-20:
--   * main dex  -> collateral USDC, coin symbols bare (e.g. BTC).
--   * xyz  dex  -> collateral USDC (collateralToken 0), coin symbols prefixed (xyz:NVDA).
--                  No USDH swap needed; swap_pair stays NULL.
--   * is_cross is false for assets flagged onlyIsolated on HL, true otherwise.
--   * sz_decimals copied verbatim from HL `meta` (wrong values break orders).
-- NOTE: the old vntl dex (vntl:MAG7 etc.) is fully DELISTED on HL, so it is not used.

begin;

-- Clear the existing curated (public, ownerless) baskets; basket_assets cascade.
delete from public.basket_assets
  where basket_id in (select id from public.baskets where owner_user_id is null);
delete from public.baskets where owner_user_id is null;

-- Insert the 3 curated baskets and capture their generated ids.
with new_baskets as (
  insert into public.baskets (owner_user_id, name, theme, description, is_public)
  values
    (
      null,
      'Silicon Vanguard',
      'ai_semiconductors',
      'The AI build-out in one click: leading chipmakers and memory, the SpaceX frontier, the copper that wires every datacenter, and decentralized AI compute (TAO).',
      true
    ),
    (
      null,
      'Genesis Bluechips',
      'crypto_majors',
      'The crypto reserve sleeve — Bitcoin, Ethereum, Solana, and HYPE — the largest, most liquid perps on HyperLiquid.',
      true
    ),
    (
      null,
      'Hard Assets',
      'commodities',
      'A real-world store-of-value basket: precious metals (gold, silver, platinum) plus energy (Brent crude, natural gas) via HIP-3 commodity perps.',
      true
    )
  returning id, name
)
insert into public.basket_assets
  (basket_id, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
select nb.id, a.coin, a.dex, a.weight, a.sz_decimals, a.collateral, a.swap_pair, a.is_cross
from new_baskets nb
join (
  values
    -- Silicon Vanguard (AI / semiconductors / frontier tech)
    ('Silicon Vanguard',  'xyz:NVDA',   'xyz', 0.22, 3, 'USDC', null::text, true),   -- Nvidia (cross-eligible)
    ('Silicon Vanguard',  'xyz:SMH',    'xyz', 0.18, 3, 'USDC', null::text, false),  -- VanEck Semis ETF (onlyIsolated)
    ('Silicon Vanguard',  'xyz:SKHX',   'xyz', 0.15, 3, 'USDC', null::text, false),  -- SK Hynix / HBM memory (onlyIsolated)
    ('Silicon Vanguard',  'xyz:SPCX',   'xyz', 0.15, 2, 'USDC', null::text, false),  -- SpaceX pre-IPO (onlyIsolated)
    ('Silicon Vanguard',  'xyz:COPPER', 'xyz', 0.15, 2, 'USDC', null::text, false),  -- Copper, datacenter metal (onlyIsolated)
    ('Silicon Vanguard',  'TAO',        '',    0.15, 3, 'USDC', null::text, true),   -- Bittensor, decentralized AI compute

    -- Genesis Bluechips (crypto majors, all main dex / USDC)
    ('Genesis Bluechips', 'BTC',        '',    0.40, 5, 'USDC', null::text, true),
    ('Genesis Bluechips', 'ETH',        '',    0.25, 4, 'USDC', null::text, true),
    ('Genesis Bluechips', 'SOL',        '',    0.20, 2, 'USDC', null::text, true),
    ('Genesis Bluechips', 'HYPE',       '',    0.15, 2, 'USDC', null::text, true),

    -- Hard Assets (precious metals + energy via xyz HIP-3 commodity perps)
    ('Hard Assets',       'xyz:GOLD',     'xyz', 0.30, 4, 'USDC', null::text, true),   -- cross-eligible
    ('Hard Assets',       'xyz:SILVER',   'xyz', 0.20, 2, 'USDC', null::text, true),   -- cross-eligible
    ('Hard Assets',       'xyz:BRENTOIL', 'xyz', 0.20, 2, 'USDC', null::text, true),   -- cross-eligible
    ('Hard Assets',       'xyz:PLATINUM', 'xyz', 0.15, 4, 'USDC', null::text, false),  -- onlyIsolated
    ('Hard Assets',       'xyz:NATGAS',   'xyz', 0.15, 1, 'USDC', null::text, false)   -- onlyIsolated
) as a(bname, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
  on a.bname = nb.name;

commit;
