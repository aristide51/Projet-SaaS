create table private.edge_rate_limit_counters (
  policy text not null check (policy ~ '^[a-z_]+:(ip|user)$'),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (policy, subject_hash)
);
alter table private.edge_rate_limit_counters enable row level security;
alter table private.edge_rate_limit_counters force row level security;
revoke all on private.edge_rate_limit_counters
  from public, anon, authenticated, service_role;

create or replace function public.consume_edge_rate_limit(
  p_policy text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_counter private.edge_rate_limit_counters;
begin
  if private.jwt_role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_policy is null or p_policy !~ '^[a-z_]+:(ip|user)$'
     or p_subject_hash is null or p_subject_hash !~ '^[a-f0-9]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 10000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
  then
    raise exception 'invalid_rate_limit_request' using errcode = '22023';
  end if;

  insert into private.edge_rate_limit_counters as counters (
    policy,
    subject_hash,
    window_started_at,
    request_count
  )
  values (p_policy, p_subject_hash, v_now, 1)
  on conflict (policy, subject_hash) do update
  set window_started_at = case
        when counters.window_started_at
          + make_interval(secs => p_window_seconds) <= v_now
        then v_now
        else counters.window_started_at
      end,
      request_count = case
        when counters.window_started_at
          + make_interval(secs => p_window_seconds) <= v_now
        then 1
        else counters.request_count + 1
      end
  returning counters.* into v_counter;

  return query
  select
    v_counter.request_count <= p_limit,
    greatest(
      1,
      ceil(extract(epoch from (
        v_counter.window_started_at
        + make_interval(secs => p_window_seconds)
        - v_now
      )))::integer
    );
end;
$$;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer)
  to service_role;

create or replace function public.cleanup_edge_rate_limit_counters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if private.jwt_role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from private.edge_rate_limit_counters
  where window_started_at < now() - interval '48 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.cleanup_edge_rate_limit_counters()
  from public, anon, authenticated, service_role;
grant execute on function public.cleanup_edge_rate_limit_counters() to service_role;

select cron.schedule(
  'cleanup-edge-rate-limit-counters',
  '17 * * * *',
  'select public.cleanup_edge_rate_limit_counters();'
);
