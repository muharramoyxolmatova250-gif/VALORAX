-- VALORAX native discovery: approved-source sitemap ingestion.
alter table public.omnisight_lot_sources
  add column if not exists sitemap_url text,
  add column if not exists sitemap_requests_hour integer not null default 0 check (sitemap_requests_hour >= 0),
  add column if not exists sitemap_request_window_started_at timestamptz,
  add column if not exists last_sitemap_fetch_at timestamptz;
alter table public.omnisight_lot_sources drop constraint if exists omnisight_lot_sources_sitemap_url_https_check;
alter table public.omnisight_lot_sources add constraint omnisight_lot_sources_sitemap_url_https_check
  check (sitemap_url is null or sitemap_url ~ '^https://');
create index if not exists omnisight_lot_sources_enabled_sitemap_idx
  on public.omnisight_lot_sources(enabled, access_status)
  where enabled = true and sitemap_url is not null;
