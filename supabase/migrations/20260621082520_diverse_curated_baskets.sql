-- Diverse curated long-only baskets (replaces prior 6 curated baskets).
-- Asset facts verified against live Hyperliquid info API on 2026-06-21:
--   native HyperCore -> dex='', USDC, bare symbol
--   xyz HIP-3      -> dex='xyz', USDC, xyz:SYMBOL prefix
--   is_cross = NOT onlyIsolated (from live meta, not docs)

begin;

delete from public.basket_assets
  where basket_id in (select id from public.baskets where owner_user_id is null);
delete from public.baskets where owner_user_id is null;

with new_baskets as (
  insert into public.baskets (owner_user_id, name, theme, description, is_public)
  values
    (null, 'Genesis Bluechips', 'crypto_majors',
     'Native HyperCore majors: BTC, ETH, SOL and HYPE — the liquid crypto backbone on Hyperliquid.',
     true),
    (null, 'Global Chip Chain', 'semiconductors',
     'End-to-end semis across geographies: US design (Nvidia, Micron, Intel), Korea memory (SK Hynix), Taiwan foundry (TSMC), EU lithography (ASML), Japan NAND (Kioxia).',
     true),
    (null, 'US Platform Giants', 'megacap_tech',
     'US mega-cap software & platforms without chip overlap: Microsoft, Alphabet, Amazon, Meta, Apple, Netflix.',
     true),
    (null, 'East Asia Tech', 'asia_tech',
     'Asia-Pacific tech & EM: Alibaba, Hyundai, Samsung, SoftBank, Korea ETF, Taiwan ETF, plus China AI names Zhipu and MiniMax.',
     true),
    (null, 'Real Assets', 'commodities',
     'Inflation & real-economy exposure: gold, silver, copper, uranium, Brent crude, natural gas, and wheat.',
     true),
    (null, 'Macro Fortress', 'macro',
     'All-weather macro sleeve: S&P 500, gold & silver anchors, plus DXY, yen, and euro rate/FX hedges.',
     true),
    (null, 'AI Compute Stack', 'ai_infra',
     'AI build-out layer: Palantir, Nvidia, Oracle, ARM, Nebius, and CoreWeave — software plus silicon.',
     true),
    (null, 'Disruptive Growth', 'growth',
     'High-beta disruptors: Tesla, Rocket Lab, Rivian, Robinhood, Coinbase, and MicroStrategy.',
     true)
  returning id, name
)
insert into public.basket_assets
  (basket_id, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
select nb.id, a.coin, a.dex, a.weight, a.sz_decimals, a.collateral, a.swap_pair, a.is_cross
from new_baskets nb
join (
  values
    -- Genesis Bluechips
    ('Genesis Bluechips', 'BTC',  '',    0.40, 5, 'USDC', null::text, true),
    ('Genesis Bluechips', 'ETH',  '',    0.25, 4, 'USDC', null::text, true),
    ('Genesis Bluechips', 'SOL',  '',    0.20, 2, 'USDC', null::text, true),
    ('Genesis Bluechips', 'HYPE', '',    0.15, 2, 'USDC', null::text, true),

    -- Global Chip Chain
    ('Global Chip Chain', 'xyz:NVDA',   'xyz', 0.18, 3, 'USDC', null::text, true),
    ('Global Chip Chain', 'xyz:SKHX',   'xyz', 0.18, 3, 'USDC', null::text, false),
    ('Global Chip Chain', 'xyz:MU',     'xyz', 0.15, 3, 'USDC', null::text, true),
    ('Global Chip Chain', 'xyz:TSM',    'xyz', 0.15, 3, 'USDC', null::text, false),
    ('Global Chip Chain', 'xyz:ASML',   'xyz', 0.14, 3, 'USDC', null::text, false),
    ('Global Chip Chain', 'xyz:INTC',   'xyz', 0.10, 2, 'USDC', null::text, false),
    ('Global Chip Chain', 'xyz:KIOXIA', 'xyz', 0.10, 3, 'USDC', null::text, false),

    -- US Platform Giants
    ('US Platform Giants', 'xyz:MSFT',  'xyz', 0.22, 3, 'USDC', null::text, true),
    ('US Platform Giants', 'xyz:GOOGL', 'xyz', 0.20, 3, 'USDC', null::text, true),
    ('US Platform Giants', 'xyz:AMZN',  'xyz', 0.18, 3, 'USDC', null::text, true),
    ('US Platform Giants', 'xyz:META',  'xyz', 0.16, 3, 'USDC', null::text, true),
    ('US Platform Giants', 'xyz:AAPL',  'xyz', 0.14, 3, 'USDC', null::text, true),
    ('US Platform Giants', 'xyz:NFLX',  'xyz', 0.10, 3, 'USDC', null::text, false),

    -- East Asia Tech
    ('East Asia Tech', 'xyz:BABA',     'xyz', 0.22, 3, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:HYUNDAI',  'xyz', 0.18, 3, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:SMSN',     'xyz', 0.18, 3, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:SOFTBANK', 'xyz', 0.14, 3, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:EWY',      'xyz', 0.12, 3, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:EWT',      'xyz', 0.08, 2, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:ZHIPU',    'xyz', 0.04, 3, 'USDC', null::text, false),
    ('East Asia Tech', 'xyz:MINIMAX',  'xyz', 0.04, 2, 'USDC', null::text, false),

    -- Real Assets
    ('Real Assets', 'xyz:GOLD',     'xyz', 0.28, 4, 'USDC', null::text, true),
    ('Real Assets', 'xyz:SILVER',   'xyz', 0.18, 2, 'USDC', null::text, true),
    ('Real Assets', 'xyz:COPPER',   'xyz', 0.15, 2, 'USDC', null::text, false),
    ('Real Assets', 'xyz:URANIUM',  'xyz', 0.12, 3, 'USDC', null::text, false),
    ('Real Assets', 'xyz:BRENTOIL', 'xyz', 0.10, 2, 'USDC', null::text, true),
    ('Real Assets', 'xyz:NATGAS',   'xyz', 0.09, 1, 'USDC', null::text, false),
    ('Real Assets', 'xyz:WHEAT',    'xyz', 0.08, 0, 'USDC', null::text, false),

    -- Macro Fortress
    ('Macro Fortress', 'xyz:SP500',  'xyz', 0.30, 3, 'USDC', null::text, true),
    ('Macro Fortress', 'xyz:GOLD',   'xyz', 0.22, 4, 'USDC', null::text, true),
    ('Macro Fortress', 'xyz:DXY',    'xyz', 0.15, 2, 'USDC', null::text, false),
    ('Macro Fortress', 'xyz:JPY',    'xyz', 0.13, 2, 'USDC', null::text, false),
    ('Macro Fortress', 'xyz:SILVER', 'xyz', 0.10, 2, 'USDC', null::text, true),
    ('Macro Fortress', 'xyz:EUR',    'xyz', 0.10, 1, 'USDC', null::text, false),

    -- AI Compute Stack
    ('AI Compute Stack', 'xyz:PLTR', 'xyz', 0.22, 3, 'USDC', null::text, false),
    ('AI Compute Stack', 'xyz:NVDA', 'xyz', 0.18, 3, 'USDC', null::text, true),
    ('AI Compute Stack', 'xyz:ORCL', 'xyz', 0.16, 3, 'USDC', null::text, false),
    ('AI Compute Stack', 'xyz:ARM',  'xyz', 0.14, 2, 'USDC', null::text, false),
    ('AI Compute Stack', 'xyz:NBIS', 'xyz', 0.15, 2, 'USDC', null::text, false),
    ('AI Compute Stack', 'xyz:CRWV', 'xyz', 0.15, 2, 'USDC', null::text, false),

    -- Disruptive Growth
    ('Disruptive Growth', 'xyz:TSLA',  'xyz', 0.25, 3, 'USDC', null::text, true),
    ('Disruptive Growth', 'xyz:RKLB',  'xyz', 0.20, 2, 'USDC', null::text, false),
    ('Disruptive Growth', 'xyz:RIVN',  'xyz', 0.15, 2, 'USDC', null::text, false),
    ('Disruptive Growth', 'xyz:HOOD',  'xyz', 0.15, 3, 'USDC', null::text, false),
    ('Disruptive Growth', 'xyz:COIN',  'xyz', 0.15, 3, 'USDC', null::text, false),
    ('Disruptive Growth', 'xyz:MSTR',  'xyz', 0.10, 3, 'USDC', null::text, false)
) as a(bname, coin, dex, weight, sz_decimals, collateral, swap_pair, is_cross)
  on a.bname = nb.name;

commit;
