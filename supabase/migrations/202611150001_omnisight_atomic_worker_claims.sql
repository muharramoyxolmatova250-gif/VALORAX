-- Durable, concurrent OMNISIGHT queue claims.
-- Workers claim rows atomically with SKIP LOCKED; expired leases can be retried.
-- This migration does not enable workers or activate any data source.

alter table public.omnisight_lot_ai_reports
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists last_error_code text;

alter table public.omnisight_discovery_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists heartbeat_at timestamptz;

create index if not exists omnisight_ai_reports_claim_idx
  on public.omnisight_lot_ai_reports(status, created_at)
  where status in ('queued','running');

create index if not exists omnisight_discovery_claim_idx
  on public.omnisight_discovery_jobs(status, run_after, created_at)
  where status in ('queued','running');

create or replace function public.omnisight_claim_ai_report(p_worker_id text)
returns setof public.omnisight_lot_ai_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker text := left(coalesce(nullif(btrim(p_worker_id), ''), 'worker'), 120);
begin
  return query
  with candidate as (
    select report.id
    from public.omnisight_lot_ai_reports report
    where report.attempts < 8
      and (
        report.status = 'queued'
        or (report.status = 'running' and report.locked_at < clock_timestamp() - interval '10 minutes')
      )
    order by report.created_at asc
    for update skip locked
    limit 1
  )
  update public.omnisight_lot_ai_reports report
  set status = 'running',
      locked_at = clock_timestamp(),
      heartbeat_at = clock_timestamp(),
      locked_by = v_worker,
      attempts = report.attempts + 1,
      started_at = coalesce(report.started_at, clock_timestamp()),
      updated_at = clock_timestamp()
  from candidate
  where report.id = candidate.id
  returning report.*;
end;
$$;

create or replace function public.omnisight_claim_discovery_job(p_worker_id text)
returns setof public.omnisight_discovery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker text := left(coalesce(nullif(btrim(p_worker_id), ''), 'worker'), 120);
begin
  return query
  with candidate as (
    select job.id
    from public.omnisight_discovery_jobs job
    join public.omnisight_lot_sources source on source.id = job.source_id
    where source.enabled = true
      and source.access_status = 'approved'
      and source.automated_access_allowed = true
      and source.terms_status in ('permitted','licensed','permission_granted')
      and job.attempts < 12
      and (
        (job.status in ('queued','failed') and job.run_after <= clock_timestamp())
        or (job.status = 'running' and job.locked_at < clock_timestamp() - interval '10 minutes')
      )
    order by job.run_after asc, job.created_at asc
    for update of job skip locked
    limit 1
  )
  update public.omnisight_discovery_jobs job
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
$$;

revoke all on function public.omnisight_claim_ai_report(text) from public, anon, authenticated;
revoke all on function public.omnisight_claim_discovery_job(text) from public, anon, authenticated;
grant execute on function public.omnisight_claim_ai_report(text) to service_role;
grant execute on function public.omnisight_claim_discovery_job(text) to service_role;
