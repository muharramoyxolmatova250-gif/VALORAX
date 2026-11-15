-- OMNISIGHT Global Lot Discovery foundation.
-- This creates a rights-aware catalogue and ingestion queue. It does NOT start crawling.
-- A worker may enqueue/fetch only sources explicitly approved for the selected access method.

create table if not exists public.omnisight_lot_sources (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  display_name text not null,
  source_type text not null check (source_type in ('auction_house','marketplace','aggregator','manufacturer','public_registry','other')),
  access_method text not null check (access_method in ('official_api','licensed_feed','permissioned_export','permitted_public_catalogue','manual_import')),
  access_status text not null default 'pending_review' check (access_status in ('pending_review','approved','paused','blocked')),
  terms_status text not null default 'unknown' check (terms_status in ('unknown','permitted','licensed','permission_granted','restricted')),
  automated_access_allowed boolean not null default false,
  terms_url text,
  robots_url text,
  rights_basis text,
  licence_reference text,
  crawl_delay_ms integer not null default 5000 check (crawl_delay_ms between 1000 and 3600000),
  max_requests_per_hour integer not null default 60 check (max_requests_per_hour between 1 and 3600),
  last_policy_reviewed_at timestamptz,
  last_robots_checked_at timestamptz,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    access_status <> 'approved'
    or (
      automated_access_allowed = true
      and terms_status in ('permitted','licensed','permission_granted')
      and rights_basis is not null
      and length(btrim(rights_basis)) > 0
      and last_policy_reviewed_at is not null
    )
  ),
  check (enabled = false or access_status = 'approved')
);

create table if not exists public.omnisight_discovered_lots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.omnisight_lot_sources(id) on delete restrict,
  source_lot_key text not null,
  canonical_url text not null,
  title text not null,
  asset_class text not null default 'unclassified',
  make text,
  model text,
  model_year integer check (model_year is null or model_year between 1500 and 2200),
  lot_number text,
  auction_house text,
  sale_date date,
  listing_status text not null default 'unknown' check (listing_status in ('active','upcoming','sold','unsold','withdrawn','unknown')),
  estimate_low numeric(18,2) check (estimate_low is null or estimate_low >= 0),
  estimate_high numeric(18,2) check (estimate_high is null or estimate_high >= 0),
  realised_price numeric(18,2) check (realised_price is null or realised_price >= 0),
  currency char(3),
  location text,
  short_factual_summary text check (short_factual_summary is null or length(short_factual_summary) <= 1200),
  identifiers jsonb not null default '{}'::jsonb,
  source_title text,
  source_record_hash text,
  verification_status text not null default 'candidate' check (verification_status in ('candidate','source_checked','human_reviewed','rejected')),
  data_use_status text not null default 'review_required' check (data_use_status in ('review_required','licensed','public_domain','permission_granted','restricted')),
  rights_reference text,
  rights_reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, source_lot_key),
  unique(source_id, canonical_url),
  check (estimate_low is null or estimate_high is null or estimate_low <= estimate_high),
  check (
    data_use_status not in ('licensed','public_domain','permission_granted')
    or (rights_reference is not null and length(btrim(rights_reference)) > 0 and rights_reviewed_at is not null)
  )
);

create index if not exists omnisight_discovered_lots_asset_idx
  on public.omnisight_discovered_lots(asset_class, make, model, model_year);
create index if not exists omnisight_discovered_lots_status_idx
  on public.omnisight_discovered_lots(listing_status, sale_date desc);
create index if not exists omnisight_discovered_lots_rights_idx
  on public.omnisight_discovered_lots(data_use_status, verification_status);
create index if not exists omnisight_discovered_lots_last_seen_idx
  on public.omnisight_discovered_lots(last_seen_at desc);

create table if not exists public.omnisight_discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.omnisight_lot_sources(id) on delete restrict,
  job_type text not null check (job_type in ('discover','fetch_listing','refresh_listing','verify_source')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','paused','cancelled')),
  cursor_state jsonb not null default '{}'::jsonb,
  pages_processed integer not null default 0 check (pages_processed >= 0),
  lots_discovered integer not null default 0 check (lots_discovered >= 0),
  lots_updated integer not null default 0 check (lots_updated >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists omnisight_discovery_jobs_queue_idx
  on public.omnisight_discovery_jobs(status, run_after, created_at)
  where status in ('queued','failed');

alter table public.omnisight_lot_sources enable row level security;
alter table public.omnisight_discovered_lots enable row level security;
alter table public.omnisight_discovery_jobs enable row level security;

revoke all on public.omnisight_lot_sources from anon, authenticated;
revoke all on public.omnisight_discovery_jobs from anon, authenticated;
revoke all on public.omnisight_discovered_lots from anon, authenticated;
grant all on public.omnisight_lot_sources to service_role;
grant all on public.omnisight_discovery_jobs to service_role;
grant all on public.omnisight_discovered_lots to service_role;

grant select on public.omnisight_discovered_lots to authenticated;
drop policy if exists "read rights-cleared discovered lots" on public.omnisight_discovered_lots;
create policy "read rights-cleared discovered lots"
  on public.omnisight_discovered_lots
  for select to authenticated
  using (
    data_use_status in ('licensed','public_domain','permission_granted')
    and rights_reference is not null
    and rights_reviewed_at is not null
  );

-- Source registry and ingestion queue remain server-role only.
