-- Durable queue for parallel web-search discovery.
-- Search jobs are independent from source-fetch jobs: search hits remain candidates
-- until each source passes the existing source-policy and publication gates.

create table if not exists public.omnisight_search_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  asset_class text not null,
  query text not null,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','paused')),
  attempts integer not null default 0 check (attempts >= 0),
  pages_processed integer not null default 0 check (pages_processed >= 0),
  raw_results integer not null default 0 check (raw_results >= 0),
  lots_stored integer not null default 0 check (lots_stored >= 0),
  duplicates integer not null default 0 check (duplicates >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint omnisight_search_jobs_batch_asset_unique unique (batch_id, asset_class)
);

create unique index if not exists omnisight_search_jobs_one_active_category_idx
  on public.omnisight_search_jobs(asset_class)
  where status in ('queued','running') or (status = 'failed' and attempts < 5);

create index if not exists omnisight_search_jobs_claim_idx
  on public.omnisight_search_jobs(status, run_after, created_at)
  where status in ('queued','failed','running');

alter table public.omnisight_search_jobs enable row level security;
revoke all on table public.omnisight_search_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.omnisight_search_jobs to service_role;

create or replace function public.omnisight_enqueue_search_batch(
  p_batch_id uuid,
  p_jobs jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inserted integer := 0;
begin
  if p_batch_id is null or jsonb_typeof(p_jobs) <> 'array' then
    raise exception 'INVALID_SEARCH_BATCH';
  end if;

  insert into public.omnisight_search_jobs(batch_id, asset_class, query)
  select p_batch_id, item.asset_class, left(item.query, 1000)
  from jsonb_to_recordset(p_jobs) as item(asset_class text, query text)
  where item.asset_class in (
    'hypercar','classic_car','racing_car','watch','fine_art','sculpture',
    'jewellery','coin','historical_artifact','collectible','yacht',
    'aircraft','real_estate','business'
  )
    and item.query is not null
    and length(btrim(item.query)) between 5 and 1000
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

create or replace function public.omnisight_claim_search_job(p_worker_id text)
returns setof public.omnisight_search_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_worker text := left(coalesce(nullif(btrim(p_worker_id), ''), 'worker'), 120);
begin
  return query
  with candidate as (
    select job.id
    from public.omnisight_search_jobs job
    where job.attempts < 5
      and (
        (job.status in ('queued','failed') and job.run_after <= clock_timestamp())
        or (job.status = 'running' and coalesce(job.locked_at, job.created_at) < clock_timestamp() - interval '5 minutes')
      )
    order by job.run_after asc, job.created_at asc
    for update of job skip locked
    limit 1
  )
  update public.omnisight_search_jobs job
  set status = 'running',
      locked_at = clock_timestamp(),
      heartbeat_at = clock_timestamp(),
      locked_by = v_worker,
      attempts = job.attempts + 1,
      started_at = coalesce(job.started_at, clock_timestamp()),
      updated_at = clock_timestamp()
  from candidate
  where job.id = candidate.id
  returning job.*;
end;
$function$;

revoke all on function public.omnisight_enqueue_search_batch(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.omnisight_claim_search_job(text) from public, anon, authenticated;
grant execute on function public.omnisight_enqueue_search_batch(uuid, jsonb) to service_role;
grant execute on function public.omnisight_claim_search_job(text) to service_role;
