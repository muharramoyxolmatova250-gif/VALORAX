-- Add explicit feed endpoints for rights-approved RSS/Atom catalogues.
-- This does not approve any source or enable scraping by itself.
alter table public.omnisight_lot_sources
  add column if not exists feed_url text,
  add column if not exists feed_requests_hour integer not null default 0
    check (feed_requests_hour >= 0),
  add column if not exists feed_request_window_started_at timestamptz,
  add column if not exists last_feed_fetch_at timestamptz;

create index if not exists omnisight_lot_sources_enabled_feed_idx
  on public.omnisight_lot_sources(enabled, access_status)
  where enabled = true and feed_url is not null;

-- A feed URL must be HTTPS and remain on the registered source domain.
alter table public.omnisight_lot_sources
  drop constraint if exists omnisight_lot_sources_feed_url_https_check;

alter table public.omnisight_lot_sources
  add constraint omnisight_lot_sources_feed_url_https_check
  check (feed_url is null or feed_url ~ '^https://');
