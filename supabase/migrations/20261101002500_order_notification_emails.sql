create extension if not exists pg_net;

create table public.notification_email_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index notification_email_jobs_queue_idx
  on public.notification_email_jobs (available_at, created_at)
  where status = 'queued';
create index notification_email_jobs_rate_limit_idx
  on public.notification_email_jobs (user_id, sent_at desc)
  where status = 'sent';

create table public.notification_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nonessential_opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_email_jobs enable row level security;
alter table public.notification_email_preferences enable row level security;
revoke all on public.notification_email_jobs from public, anon, authenticated;
revoke all on public.notification_email_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_email_jobs to service_role;
grant select, insert, update on public.notification_email_preferences to service_role;

create table private.notification_email_webhook_settings (
  singleton boolean primary key default true check (singleton),
  endpoint text not null check (
    endpoint ~ '^https://'
    or endpoint ~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?/'
  ),
  webhook_secret text not null check (char_length(webhook_secret) >= 32),
  updated_at timestamptz not null default now()
);
revoke all on private.notification_email_webhook_settings
  from public, anon, authenticated, service_role;

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
     and not (
       new.type = 'order_status'
       and new.payload ->> 'status' in (
         'payment_declared', 'paid', 'pending_payment', 'confirmed',
         'ready', 'completed', 'cancelled', 'refunded'
       )
     ) then
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

create or replace function private.notify_customer_order_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (
    new.customer_id,
    'order_received',
    jsonb_build_object('order_id', new.id, 'code', new.code)
  );
  return new;
end;
$$;

create or replace function private.notify_customer_payment_declared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (
    new.customer_id,
    'order_status',
    jsonb_build_object(
      'order_id', new.id,
      'code', new.code,
      'status', 'payment_declared'
    )
  );
  return new;
end;
$$;

drop trigger if exists notification_email_dispatch on public.notifications;
create trigger notification_email_dispatch
  after insert on public.notifications
  for each row execute function private.dispatch_notification_email();

drop trigger if exists order_received_notification on public.orders;
create trigger order_received_notification
  after insert on public.orders
  for each row execute function private.notify_customer_order_received();

drop trigger if exists payment_declared_notification on public.orders;
create trigger payment_declared_notification
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status and new.status = 'payment_declared')
  execute function private.notify_customer_payment_declared();

revoke all on function private.dispatch_notification_email()
  from public, anon, authenticated;
revoke all on function private.notify_customer_order_received()
  from public, anon, authenticated;
revoke all on function private.notify_customer_payment_declared()
  from public, anon, authenticated;
