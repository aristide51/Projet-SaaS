-- Reminder delivery and cancellation capability state is private to the database.
create table private.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reminder_stage text not null check (reminder_stage in ('24_hours', '2_hours')),
  created_at timestamptz not null default now(),
  token_used_at timestamptz,
  unique (booking_id, reminder_stage)
);

create table private.booking_reminder_cron_health (
  singleton boolean primary key default true check (singleton),
  last_success_at timestamptz not null default now(),
  alerted_at timestamptz
);
insert into private.booking_reminder_cron_health (singleton) values (true)
on conflict (singleton) do nothing;

revoke all on private.booking_reminders, private.booking_reminder_cron_health
  from public, anon, authenticated, service_role;

create or replace function public.process_booking_reminders(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_reminder_id uuid;
  v_count integer := 0;
  v_stage text;
  v_offset interval;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_stage, v_offset in
    select '24_hours'::text, interval '24 hours'
    union all
    select '2_hours'::text, interval '2 hours'
  loop
    for v_booking in
      select b.id, b.customer_id, lower(b.during) as starts_at
      from public.bookings b
      where b.status in ('pending', 'confirmed')
        and lower(b.during) <= p_now + v_offset
        and lower(b.during) > p_now + v_offset - interval '6 hours'
    loop
      insert into private.booking_reminders (booking_id, reminder_stage)
      values (v_booking.id, v_stage)
      on conflict (booking_id, reminder_stage) do nothing
      returning id into v_reminder_id;

      if v_reminder_id is not null then
        insert into public.notifications (user_id, type, payload)
        values (
          v_booking.customer_id,
          'booking_reminder',
          jsonb_build_object(
            'booking_id', v_booking.id,
            'reminder_stage', v_stage,
            'starts_at', v_booking.starts_at
          )
        );
        v_count := v_count + 1;
      end if;
      v_reminder_id := null;
    end loop;
  end loop;

  update private.booking_reminder_cron_health
  set last_success_at = p_now, alerted_at = null
  where singleton;
  return v_count;
end;
$$;

create or replace function public.issue_booking_cancel_token(
  p_booking_id uuid,
  p_reminder_stage text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
  v_cancel_before_hours integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reminder_stage not in ('24_hours', '2_hours') then
    raise exception 'invalid_reminder_stage' using errcode = '22023';
  end if;

  select lower(b.during), ss.booking_cancel_before_hours
  into v_starts_at, v_cancel_before_hours
  from private.booking_reminders r
  join public.bookings b on b.id = r.booking_id
  join public.shop_settings ss on ss.shop_id = b.shop_id
  where r.booking_id = p_booking_id
    and r.reminder_stage = p_reminder_stage
    and b.status in ('pending', 'confirmed');

  if not found or now() > v_starts_at - make_interval(hours => v_cancel_before_hours) then
    return null;
  end if;
  return v_starts_at;
end;
$$;

create or replace function public.redeem_booking_cancel_token(
  p_booking_id uuid,
  p_reminder_stage text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_original_claims text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reminder_stage not in ('24_hours', '2_hours') or p_expires_at <= now() then
    raise exception 'booking_cancel_link_expired';
  end if;

  perform 1
  from private.booking_reminders r
  where r.booking_id = p_booking_id
    and r.reminder_stage = p_reminder_stage
    and r.token_used_at is null
  for update;
  if not found then
    raise exception 'booking_cancel_link_used';
  end if;

  select b.*, ss.booking_cancel_before_hours
  into v_booking
  from public.bookings b
  join public.shop_settings ss on ss.shop_id = b.shop_id
  where b.id = p_booking_id
  for update of b;
  if not found or v_booking.status not in ('pending', 'confirmed') then
    raise exception 'booking_not_cancellable';
  end if;
  if now() > lower(v_booking.during)
       - make_interval(hours => v_booking.booking_cancel_before_hours) then
    raise exception 'cancellation_too_late';
  end if;
  if p_expires_at <> lower(v_booking.during) then
    raise exception 'booking_cancel_link_invalid';
  end if;

  update private.booking_reminders
  set token_used_at = now()
  where booking_id = p_booking_id
    and reminder_stage = p_reminder_stage
    and token_used_at is null;
  if not found then
    raise exception 'booking_cancel_link_used';
  end if;

  v_original_claims := current_setting('request.jwt.claims', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_booking.customer_id,
      'role', 'authenticated'
    )::text,
    true
  );
  perform public.set_booking_status(
    p_booking_id,
    'cancelled',
    'Annulation demandée depuis le rappel e-mail'
  );
  perform set_config('request.jwt.claims', coalesce(v_original_claims, ''), true);
  perform private.write_audit(
    v_booking.shop_id,
    'booking.cancelled_by_email_link',
    'bookings',
    p_booking_id,
    jsonb_build_object('reminder_stage', p_reminder_stage)
  );
end;
$$;

create or replace function public.monitor_booking_reminder_cron()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_success timestamptz;
  v_alerted_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select last_success_at, alerted_at
  into v_last_success, v_alerted_at
  from private.booking_reminder_cron_health
  where singleton
  for update;

  if v_last_success < now() - interval '15 minutes' and v_alerted_at is null then
    insert into public.notifications (user_id, type, payload)
    select p.id, 'cron_job_stale',
      jsonb_build_object('job_name', 'booking-reminders', 'last_success_at', v_last_success)
    from public.profiles p
    where p.role_global = 'admin';
    update private.booking_reminder_cron_health
    set alerted_at = now()
    where singleton;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.process_booking_reminders(timestamptz)
  from public, anon, authenticated;
revoke all on function public.issue_booking_cancel_token(uuid, text)
  from public, anon, authenticated;
revoke all on function public.redeem_booking_cancel_token(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.monitor_booking_reminder_cron()
  from public, anon, authenticated;
grant execute on function public.process_booking_reminders(timestamptz) to service_role;
grant execute on function public.issue_booking_cancel_token(uuid, text) to service_role;
grant execute on function public.redeem_booking_cancel_token(uuid, text, timestamptz) to service_role;
grant execute on function public.monitor_booking_reminder_cron() to service_role;

create or replace function private.dispatch_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_endpoint text;
  v_secret text;
begin
  if new.type <> 'order_received'
     and new.type <> 'booking_reminder'
     and not (
       new.type = 'order_status'
       and new.payload ->> 'status' in (
         'payment_declared', 'paid', 'pending_payment', 'confirmed',
         'ready', 'completed', 'cancelled', 'refunded'
       )
     )
     and new.type <> 'subscription_reminder' then
    return new;
  end if;

  insert into public.notification_email_jobs (notification_id, user_id)
  values (new.id, new.user_id)
  on conflict (notification_id) do nothing
  returning id into v_job_id;
  if v_job_id is null then
    return new;
  end if;

  select endpoint, webhook_secret
  into v_endpoint, v_secret
  from private.notification_email_webhook_settings
  where singleton;
  if v_endpoint is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('job_id', v_job_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Notification e-mail webhook enqueue failed (SQLSTATE %).',
    sqlstate;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname in ('process-booking-reminders', 'monitor-booking-reminder-cron');
select cron.schedule(
  'process-booking-reminders',
  '*/5 * * * *',
  $$select public.process_booking_reminders();$$
);
select cron.schedule(
  'monitor-booking-reminder-cron',
  '*/5 * * * *',
  $$select public.monitor_booking_reminder_cron();$$
);
