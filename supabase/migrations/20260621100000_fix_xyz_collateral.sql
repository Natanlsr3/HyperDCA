-- Defensive cleanup: xyz HIP-3 dex settles in USDC (collateralToken index 0 per live HL API).
-- The original *_init.sql seed incorrectly set xyz assets to collateral='USDH' + swap_pair='@230'.
-- The seed_default_baskets migration already rebuilt the curated rows correctly, but this
-- guarantees a from-scratch re-apply (or any stray rows) can never keep the bad swap config.
-- Idempotent: only touches rows that are still wrong; leaves basket contents otherwise intact.

update public.basket_assets
set collateral = 'USDC',
    swap_pair = null
where dex = 'xyz'
  and (collateral is distinct from 'USDC' or swap_pair is not null);
