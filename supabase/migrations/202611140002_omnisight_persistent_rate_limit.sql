-- Persistent per-user rate limiting across serverless function instances.
-- Apply after 202611140001_omnisight_intelligence.sql.

create table if not exists public.omnisight_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.omnisight_rate_limits enable row level security;
revoke all on public.omnisight_rate_limits from anon, authenticated;
grant all on public.omnisight_rate_limits to service_role;

create or replace function public.omnisight_consume_rate_limit(
  p_user_id uuid,
  p_limit integer default 3,
  p_window_seconds integer default 60
)
returns table(allowed boolean, used integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_started_at timestamptz;
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_limit < 1 or p_limit > 20 or p_window_seconds < 10 or p_window_seconds > 3600 then
    raise exception 'invalid_rate_limit_parameters';
  end if;

  insert into public.omnisight_rate_limits(user_id, window_started_at, request_count, updated_at)
  values (p_user_id, v_now, 1, v_now)
  on conflict (user_id) do update
  set
    window_started_at = case
      when public.omnisight_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then v_now
      else public.omnisight_rate_limits.window_started_at
    end,
    request_count = case
      when public.omnisight_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then 1
      else public.omnisight_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning public.omnisight_rate_limits.window_started_at, public.omnisight_rate_limits.request_count
  into v_started_at, v_count;

  return query select
    (v_count <= p_limit),
    v_count,
    v_started_at + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.omnisight_consume_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.omnisight_consume_rate_limit(uuid, integer, integer) to service_role;
