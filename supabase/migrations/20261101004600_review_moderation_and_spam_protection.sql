create table private.review_submission_limits (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count > 0)
);
alter table private.review_submission_limits enable row level security;
alter table private.review_submission_limits force row level security;
revoke all on private.review_submission_limits
  from public, anon, authenticated, service_role;

create table public.review_moderation_history (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  previous_status public.review_status not null,
  new_status public.review_status not null,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index review_moderation_history_review_created_idx
  on public.review_moderation_history (review_id, created_at desc);
alter table public.review_moderation_history enable row level security;
revoke all on public.review_moderation_history from public, anon, authenticated;
grant select on public.review_moderation_history to authenticated;
create policy review_moderation_history_admin_read
  on public.review_moderation_history for select to authenticated
  using (private.is_admin());

create or replace function private.guard_review_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit private.review_submission_limits;
  v_comment text := nullif(regexp_replace(lower(btrim(coalesce(new.comment, ''))), '[[:space:]]+', ' ', 'g'), '');
begin
  insert into private.review_submission_limits as limits (
    customer_id, window_started_at, submission_count
  )
  values (new.customer_id, v_now, 1)
  on conflict (customer_id) do update
  set window_started_at = case
        when limits.window_started_at + interval '1 hour' <= v_now then v_now
        else limits.window_started_at
      end,
      submission_count = case
        when limits.window_started_at + interval '1 hour' <= v_now then 1
        else limits.submission_count + 1
      end
  returning * into v_limit;

  if v_limit.submission_count > 3 then
    raise exception 'review_rate_limited' using errcode = 'P0001';
  end if;

  if coalesce(new.comment, '') ~* '(^|[^[:alnum:]])(https?://|www\.)'
     or coalesce(new.comment, '') ~* '(^|[[:space:]])[[:alnum:]._-]+\.(com|net|org|info|biz|io|app|site|bf)([/[:space:]?#]|$)'
  then
    raise exception 'review_contains_link' using errcode = '22023';
  end if;

  if v_comment is not null
     and char_length(v_comment) < 20
     and exists (
       select 1
       from public.reviews r
       where r.customer_id = new.customer_id
         and r.created_at >= v_now - interval '24 hours'
         and char_length(btrim(coalesce(r.comment, ''))) < 20
         and regexp_replace(lower(btrim(coalesce(r.comment, ''))), '[[:space:]]+', ' ', 'g') = v_comment
     )
  then
    raise exception 'review_spam_repeated' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
create trigger reviews_submission_guard
  before insert on public.reviews
  for each row execute function private.guard_review_submission();
revoke all on function private.guard_review_submission()
  from public, anon, authenticated, service_role;

create or replace function public.moderate_review(
  p_review_id uuid,
  p_status public.review_status,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status public.review_status;
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('published', 'hidden', 'flagged') then
    raise exception 'invalid_review_status' using errcode = '22023';
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid_moderation_reason' using errcode = '22023';
  end if;

  select r.status into v_previous_status
  from public.reviews r
  where r.id = p_review_id
  for update;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if v_previous_status = p_status then
    raise exception 'review_status_unchanged';
  end if;

  update public.reviews set status = p_status where id = p_review_id;
  insert into public.review_moderation_history (
    review_id, actor_id, previous_status, new_status, reason
  )
  values (
    p_review_id, auth.uid(), v_previous_status, p_status, nullif(btrim(p_reason), '')
  );
end;
$$;

create or replace function public.moderate_review(
  p_review_id uuid,
  p_status public.review_status
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.moderate_review(p_review_id, p_status, null);
$$;

create or replace function public.resolve_review_report(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_review_report_status';
  end if;
  update public.review_reports
  set status = p_status, resolved_at = now()
  where id = p_report_id and status = 'open';
  if not found then
    raise exception 'review_report_not_found';
  end if;
end;
$$;

revoke all on function public.moderate_review(uuid, public.review_status, text)
  from public, anon;
revoke all on function public.moderate_review(uuid, public.review_status)
  from public, anon;
revoke all on function public.resolve_review_report(uuid, text)
  from public, anon;
grant execute on function public.moderate_review(uuid, public.review_status, text)
  to authenticated;
grant execute on function public.moderate_review(uuid, public.review_status)
  to authenticated;
grant execute on function public.resolve_review_report(uuid, text)
  to authenticated;
