-- OMNISIGHT live/upcoming $500k+ catalogue and per-lot intelligence.
-- Depends on 202611140003_omnisight_global_lot_discovery.sql.
-- Adds metadata only; it does not import lots, scrape sources or launch AI jobs.

alter table public.omnisight_discovered_lots
  add column if not exists hero_image_url text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb,
  add column if not exists image_usage_status text not null default 'link_only'
    check (image_usage_status in ('link_only','licensed','permission_granted','restricted','unknown')),
  add column if not exists image_rights_reference text,
  add column if not exists auction_starts_at timestamptz,
  add column if not exists auction_ends_at timestamptz,
  add column if not exists published_value_usd numeric(18,2),
  add column if not exists value_basis text
    check (value_basis is null or value_basis in ('estimate_low','reserve','asking_price','current_bid','fixed_price')),
  add column if not exists value_source_url text,
  add column if not exists value_checked_at timestamptz,
  add column if not exists catalog_last_evaluated_at timestamptz;

alter table public.omnisight_discovered_lots
  add constraint omnisight_lots_image_urls_array_check
  check (jsonb_typeof(image_urls) = 'array');

alter table public.omnisight_discovered_lots
  add constraint omnisight_lots_live_window_check
  check (auction_ends_at is null or auction_starts_at is null or auction_ends_at > auction_starts_at);

create index if not exists omnisight_discovered_lots_catalog_idx
  on public.omnisight_discovered_lots(listing_status, published_value_usd desc, sale_date)
  where listing_status in ('active','upcoming') and published_value_usd >= 500000;

create table if not exists public.omnisight_lot_ai_reports (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.omnisight_discovered_lots(id) on delete cascade,
  report_version integer not null default 1 check (report_version > 0),
  status text not null default 'queued'
    check (status in ('queued','running','completed','partial','failed','stale')),
  verdict text check (verdict is null or verdict in ('GOOD','BAD','UNCERTAIN')),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  summary text,
  intelligence_modules jsonb not null default '{}'::jsonb,
  service_layers jsonb not null default '{}'::jsonb,
  advanced_analysis jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  model_name text,
  prompt_version text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lot_id, report_version),
  check (jsonb_typeof(intelligence_modules) = 'object'),
  check (jsonb_typeof(service_layers) = 'object'),
  check (jsonb_typeof(advanced_analysis) = 'object'),
  check (jsonb_typeof(evidence_refs) = 'array'),
  check (jsonb_typeof(limitations) = 'array')
);

create index if not exists omnisight_lot_ai_reports_lot_status_idx
  on public.omnisight_lot_ai_reports(lot_id, status, created_at desc);

alter table public.omnisight_lot_ai_reports enable row level security;
revoke all on public.omnisight_lot_ai_reports from anon, authenticated;
grant all on public.omnisight_lot_ai_reports to service_role;

-- Reports are only readable when the underlying lot is eligible for the public catalogue
-- and its text/image data-use rights have been reviewed.
grant select on public.omnisight_discovered_lots to anon;
drop policy if exists "read rights-cleared discovered lots" on public.omnisight_discovered_lots;
create policy "read rights-cleared discovered lots"
  on public.omnisight_discovered_lots
  for select to anon, authenticated
  using (
    listing_status in ('active','upcoming')
    and published_value_usd >= 500000
    and data_use_status in ('licensed','public_domain','permission_granted')
    and rights_reference is not null
    and rights_reviewed_at is not null
    and image_usage_status <> 'restricted'
  );

grant select on public.omnisight_lot_ai_reports to anon, authenticated;
drop policy if exists "read reports for eligible public lots" on public.omnisight_lot_ai_reports;
create policy "read reports for eligible public lots"
  on public.omnisight_lot_ai_reports
  for select to anon, authenticated
  using (
    status in ('completed','partial')
    and exists (
      select 1
      from public.omnisight_discovered_lots lot
      where lot.id = omnisight_lot_ai_reports.lot_id
        and lot.listing_status in ('active','upcoming')
        and lot.published_value_usd >= 500000
        and lot.data_use_status in ('licensed','public_domain','permission_granted')
        and lot.rights_reference is not null
        and lot.rights_reviewed_at is not null
        and lot.image_usage_status <> 'restricted'
    )
  );
