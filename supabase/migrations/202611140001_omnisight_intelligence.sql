-- OMNISIGHT production data foundation.
-- Apply in Supabase SQL Editor before enabling the protected server endpoint.

create extension if not exists pgcrypto;

-- Shared public-asset index. Only server-curated public research metadata is written here.
create table if not exists public.omnisight_global_assets (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  canonical_key text not null unique,
  asset_class text not null default 'unclassified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.omnisight_global_sources (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.omnisight_global_asset_sources (
  id uuid primary key default gen_random_uuid(),
  global_asset_id uuid not null references public.omnisight_global_assets(id) on delete cascade,
  global_source_id uuid not null references public.omnisight_global_sources(id) on delete cascade,
  source_url text not null,
  source_title text not null,
  source_kind text not null default 'web_search_citation',
  evidence_state text not null default 'search_returned' check (evidence_state in ('search_returned','human_reviewed','rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(global_asset_id, source_url)
);

create index if not exists omnisight_global_asset_sources_source_idx on public.omnisight_global_asset_sources(global_source_id, last_seen_at desc);

create table if not exists public.omnisight_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  global_asset_id uuid references public.omnisight_global_assets(id) on delete set null,
  display_name text not null,
  canonical_key text not null,
  asset_class text not null default 'unclassified',
  identifiers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, canonical_key)
);

create table if not exists public.omnisight_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.omnisight_assets(id) on delete cascade,
  client_record_id text not null,
  claim text not null,
  source_name text not null,
  source_url text,
  evidence_status text not null check (evidence_status in ('seller_claim','source_observed','independently_corroborated','disputed','unknown')),
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, asset_id, client_record_id)
);

create table if not exists public.omnisight_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.omnisight_assets(id) on delete cascade,
  model text not null,
  verdict text not null check (verdict in ('GOOD','BAD','UNCERTAIN')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  report jsonb not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Private, per-user entity graph. Connections are leads until a human reviews their evidence.
create table if not exists public.omnisight_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('asset','person','organization','auction','document','source','event','identifier')),
  canonical_key text not null,
  label text not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(owner_id, entity_type, canonical_key)
);

create table if not exists public.omnisight_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_entity_id uuid not null references public.omnisight_entities(id) on delete cascade,
  to_entity_id uuid not null references public.omnisight_entities(id) on delete cascade,
  relationship_type text not null,
  evidence_id uuid references public.omnisight_evidence(id) on delete set null,
  analysis_id uuid references public.omnisight_analyses(id) on delete set null,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  review_status text not null default 'candidate' check (review_status in ('candidate','verified','rejected')),
  created_at timestamptz not null default now(),
  check (from_entity_id <> to_entity_id),
  unique(owner_id, from_entity_id, to_entity_id, relationship_type, evidence_id)
);

-- Curated auction results. "verified" means the auction-house result page was checked;
-- it does not prove payment settlement, title transfer, authenticity or condition.
create table if not exists public.omnisight_market_sales (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  model_year integer,
  chassis_identifier text,
  production_serial text,
  auction_house text not null,
  auction_name text not null,
  lot_number text,
  sale_date date,
  event_start date,
  event_end date,
  location text,
  sale_amount numeric(18,2) not null check (sale_amount > 0),
  currency char(3) not null,
  result_status text not null check (result_status in ('sold','unsold','withdrawn')),
  source_url text not null unique,
  source_title text not null,
  verification_status text not null default 'candidate' check (verification_status in ('candidate','verified','rejected')),
  verification_basis text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((verification_status <> 'verified') or (verified_at is not null and verification_basis is not null))
);

create index if not exists omnisight_assets_owner_idx on public.omnisight_assets(owner_id, updated_at desc);
create index if not exists omnisight_evidence_asset_idx on public.omnisight_evidence(owner_id, asset_id, created_at desc);
create index if not exists omnisight_analyses_asset_idx on public.omnisight_analyses(owner_id, asset_id, created_at desc);
create index if not exists omnisight_entities_owner_idx on public.omnisight_entities(owner_id, entity_type);
create index if not exists omnisight_relationships_owner_idx on public.omnisight_relationships(owner_id, from_entity_id, to_entity_id);
create index if not exists omnisight_sales_model_idx on public.omnisight_market_sales(make, model, sale_date desc);
create index if not exists omnisight_sales_identifier_idx on public.omnisight_market_sales(chassis_identifier);

-- Atomic monthly AI quota. The server role is the only caller.
create table if not exists public.omnisight_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  analyses_used integer not null default 0 check (analyses_used >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, month_start)
);

create or replace function public.omnisight_consume_monthly_credit(p_user_id uuid, p_monthly_limit integer default 10)
returns table(allowed boolean, used integer, monthly_limit integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_used integer;
begin
  if p_monthly_limit < 1 or p_monthly_limit > 1000 then
    raise exception 'Invalid monthly limit';
  end if;

  insert into public.omnisight_usage_monthly(user_id, month_start, analyses_used)
  values (p_user_id, v_month, 0)
  on conflict (user_id, month_start) do nothing;

  update public.omnisight_usage_monthly u
  set analyses_used = u.analyses_used + 1, updated_at = now()
  where u.user_id = p_user_id
    and u.month_start = v_month
    and u.analyses_used < p_monthly_limit
  returning u.analyses_used into v_used;

  if v_used is not null then
    return query select true, v_used, p_monthly_limit, (v_month + interval '1 month')::timestamptz;
  else
    select u.analyses_used into v_used
    from public.omnisight_usage_monthly u
    where u.user_id = p_user_id and u.month_start = v_month;
    return query select false, coalesce(v_used, p_monthly_limit), p_monthly_limit, (v_month + interval '1 month')::timestamptz;
  end if;
end;
$$;

revoke all on function public.omnisight_consume_monthly_credit(uuid, integer) from public, anon, authenticated;
grant execute on function public.omnisight_consume_monthly_credit(uuid, integer) to service_role;

alter table public.omnisight_global_assets enable row level security;
alter table public.omnisight_global_sources enable row level security;
alter table public.omnisight_global_asset_sources enable row level security;
alter table public.omnisight_assets enable row level security;
alter table public.omnisight_evidence enable row level security;
alter table public.omnisight_analyses enable row level security;
alter table public.omnisight_entities enable row level security;
alter table public.omnisight_relationships enable row level security;
alter table public.omnisight_market_sales enable row level security;
alter table public.omnisight_usage_monthly enable row level security;

drop policy if exists "signed-in users read global assets" on public.omnisight_global_assets;
create policy "signed-in users read global assets" on public.omnisight_global_assets for select to authenticated using (true);
drop policy if exists "signed-in users read global sources" on public.omnisight_global_sources;
create policy "signed-in users read global sources" on public.omnisight_global_sources for select to authenticated using (true);
drop policy if exists "signed-in users read global asset source links" on public.omnisight_global_asset_sources;
create policy "signed-in users read global asset source links" on public.omnisight_global_asset_sources for select to authenticated using (evidence_state <> 'rejected');

-- User-facing direct reads are scoped to the signed-in owner.
drop policy if exists "owner reads own omnisight assets" on public.omnisight_assets;
create policy "owner reads own omnisight assets" on public.omnisight_assets for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner reads own omnisight evidence" on public.omnisight_evidence;
create policy "owner reads own omnisight evidence" on public.omnisight_evidence for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner reads own omnisight analyses" on public.omnisight_analyses;
create policy "owner reads own omnisight analyses" on public.omnisight_analyses for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner reads own omnisight entities" on public.omnisight_entities;
create policy "owner reads own omnisight entities" on public.omnisight_entities for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owner reads own omnisight relationships" on public.omnisight_relationships;
create policy "owner reads own omnisight relationships" on public.omnisight_relationships for select to authenticated using (owner_id = auth.uid());
drop policy if exists "signed-in users read verified market sales" on public.omnisight_market_sales;
create policy "signed-in users read verified market sales" on public.omnisight_market_sales for select to authenticated using (verification_status = 'verified');
drop policy if exists "owner reads own monthly usage" on public.omnisight_usage_monthly;
create policy "owner reads own monthly usage" on public.omnisight_usage_monthly for select to authenticated using (user_id = auth.uid());

-- Seed only auction-house-published sold results. These are catalogue results, not
-- independent confirmation of settlement, vehicle authenticity or legal ownership.
insert into public.omnisight_market_sales
(make, model, model_year, chassis_identifier, production_serial, auction_house, auction_name, lot_number, sale_date, event_start, event_end, location, sale_amount, currency, result_status, source_url, source_title, verification_status, verification_basis, verified_at)
values
('Pagani','Huayra R',2022,'ZA9H11WTYYSF76003','11/30','RM Sotheby''s','The Tailored for Speed Collection','132','2025-10-11','2025-10-11','2025-10-11','Zurich, Switzerland',2367500,'CHF','sold','https://rmsothebys.com/auctions/id25/lots/r0042-2022-pagani-huayra-r/','2022 Pagani Huayra R | The Tailored for Speed Collection | RM Sotheby''s','verified','Primary auction-house lot page explicitly lists chassis ZA9H11WTYYSF76003, serial 11/30 and CHF 2,367,500 Sold; auction event page dates the sale 11 October 2025. This verifies the published auction result only.',now()),
('Pagani','Huayra R',2022,'ZA9H11WTYYSF76005','5/30','RM Sotheby''s','Paris 2025','254',null,'2025-02-04','2025-02-05','Paris, France',3042500,'EUR','sold','https://backoffice.rmsothebys.com/auctions/pa25/lots/r0020-2022-pagani-huayra-r/','2022 Pagani Huayra R | Paris 2025 | RM Sotheby''s','verified','Primary auction-house lot page explicitly lists chassis ZA9H11WTYYSF76005, serial 5/30 and EUR 3,042,500 Sold; Paris auction event ran 4–5 February 2025, but this row does not assert the exact lot sale day.',now())
on conflict (source_url) do update set
  sale_amount = excluded.sale_amount,
  currency = excluded.currency,
  result_status = excluded.result_status,
  verification_status = excluded.verification_status,
  verification_basis = excluded.verification_basis,
  verified_at = excluded.verified_at;
