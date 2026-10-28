create extension if not exists pg_cron with schema pg_catalog;

create table private.order_declaration_reminders (
  order_id uuid not null references public.orders(id) on delete cascade,
  reminder_stage text not null check (reminder_stage in ('2h', '24h', '72h')),
  sent_at timestamptz not null default now(),
  primary key (order_id, reminder_stage)
);
revoke all on private.order_declaration_reminders
  from public, anon, authenticated, service_role;

create table private.cron_job_health (
  job_name text primary key,
  outage_started_at timestamptz not null default now(),
  alerted_at timestamptz,
  recovered_at timestamptz
);
revoke all on private.cron_job_health from public, anon, authenticated, service_role;

create table private.payment_reconciliation_settings (
  singleton boolean primary key default true check (singleton),
  endpoint text not null check (
    endpoint ~ '^https://'
    or endpoint ~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]+)?/'
  ),
  webhook_secret text not null check (char_length(webhook_secret) >= 32),
  updated_at timestamptz not null default now()
);
revoke all on private.payment_reconciliation_settings
  from public, anon, authenticated, service_role;

create or replace function public.remind_pending_declarations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_stage text;
  v_sent integer := 0;
  v_member record;
  v_admin record;
begin
  for v_order in
    select o.id, o.shop_id, o.code, h.created_at as declared_at
    from public.orders o
    join lateral (
      select history.created_at
      from public.order_status_history history
      where history.order_id = o.id
        and history.to_status = 'payment_declared'
      order by history.created_at desc
      limit 1
    ) h on true
    where o.status = 'payment_declared'
      and h.created_at <= now() - interval '2 hours'
    order by h.created_at
    for update of o skip locked
  loop
    foreach v_stage in array array['2h', '24h', '72h']
    loop
      if (v_stage = '2h' and v_order.declared_at <= now() - interval '2 hours')
        or (v_stage = '24h' and v_order.declared_at <= now() - interval '24 hours')
        or (v_stage = '72h' and v_order.declared_at <= now() - interval '72 hours')
      then
        insert into private.order_declaration_reminders (order_id, reminder_stage)
        values (v_order.id, v_stage)
        on conflict (order_id, reminder_stage) do nothing;

        if not found then
          continue;
        end if;

        if v_stage = '72h' then
          for v_admin in
            select p.id from public.profiles p where p.role_global = 'admin'
          loop
            insert into public.notifications (user_id, type, payload)
            values (
              v_admin.id,
              'admin_order_declaration_overdue',
              jsonb_build_object(
                'order_id', v_order.id,
                'order_code', v_order.code,
                'shop_id', v_order.shop_id,
                'reminder_stage', v_stage
              )
            );
          end loop;
        else
          for v_member in
            select m.user_id
            from public.shop_members m
            where m.shop_id = v_order.shop_id
              and (
                m.role = 'owner'
                or coalesce((m.permissions ->> 'orders')::boolean, false)
              )
          loop
            insert into public.notifications (user_id, type, payload)
            values (
              v_member.user_id,
              'order_declaration_reminder',
              jsonb_build_object(
                'order_id', v_order.id,
                'order_code', v_order.code,
                'shop_id', v_order.shop_id,
                'reminder_stage', v_stage
              )
            );
          end loop;
        end if;
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;

  return v_sent;
end;
$$;

create or replace function public.process_aggregator_webhook(
  p_provider text,
  p_event_id text,
  p_payment_id uuid,
  p_provider_ref text,
  p_provider_status text,
  p_sanitized_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order public.orders;
  v_event_id uuid;
  v_payment_status public.payment_status;
begin
  if private.jwt_role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_provider is null or p_provider !~ '^[a-z0-9_-]{1,40}$'
     or p_event_id is null or char_length(p_event_id) not between 1 and 160
     or p_provider_status is null
     or p_provider_status not in ('pending', 'succeeded', 'failed', 'expired', 'refunded')
     or p_sanitized_payload is null
     or jsonb_typeof(p_sanitized_payload) <> 'object'
  then
    raise exception 'invalid_webhook_event' using errcode = '22023';
  end if;

  insert into public.webhook_events (provider, event_id, payload)
  values (
    p_provider,
    p_event_id,
    coalesce(p_sanitized_payload, '{}'::jsonb) || jsonb_build_object(
      'payment_id', p_payment_id,
      'provider_ref', p_provider_ref,
      'status', p_provider_status
    )
  )
  on conflict (provider, event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return 'duplicate';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id and provider = p_provider
  for update;

  if not found or v_payment.order_id is null then
    update public.webhook_events set processed_at = now() where id = v_event_id;
    return 'ignored';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id and shop_id = v_payment.shop_id
  for update;

  if not found or v_order.payment_method <> 'aggregator' then
    update public.webhook_events set processed_at = now() where id = v_event_id;
    return 'ignored';
  end if;

  v_payment_status := p_provider_status::public.payment_status;

  if p_provider_status = 'succeeded' then
    if v_order.status <> 'pending_payment' then
      update public.webhook_events set processed_at = now() where id = v_event_id;
      return 'ignored';
    end if;

    update public.payments
    set status = 'succeeded',
        provider_ref = coalesce(p_provider_ref, provider_ref),
        updated_at = now()
    where id = v_payment.id;

    perform public.transition_order(v_order.id, 'paid');
  else
    if p_provider_status = 'refunded'
       or v_payment.status = 'succeeded'
       or v_order.status <> 'pending_payment'
    then
      update public.webhook_events set processed_at = now() where id = v_event_id;
      return 'ignored';
    end if;

    update public.payments
    set status = v_payment_status,
        provider_ref = coalesce(p_provider_ref, provider_ref),
        updated_at = now()
    where id = v_payment.id;
  end if;

  update public.webhook_events set processed_at = now() where id = v_event_id;
  return case when p_provider_status = 'succeeded' then 'paid' else 'recorded' end;
end;
$$;

create or replace function public.reconcile_stale_aggregator_payments()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_secret text;
begin
  select endpoint, webhook_secret
  into v_endpoint, v_secret
  from private.payment_reconciliation_settings
  where singleton;

  if v_endpoint is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('task', 'reconcile'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-payment-cron-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'Payment reconciliation dispatch failed (SQLSTATE %).', sqlstate;
end;
$$;

create or replace function public.monitor_order_cron_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_admin record;
  v_alerted integer := 0;
  v_has_recent_success boolean;
  v_state private.cron_job_health;
begin
  for v_job in
    select expected.jobname, j.jobid
    from (values
      ('expire-pending-orders'),
      ('remind-pending-declarations'),
      ('reconcile-stale-aggregator-payments')
    ) expected(jobname)
    left join cron.job j on j.jobname = expected.jobname
  loop
    select v_job.jobid is not null and exists (
      select 1
      from cron.job_run_details d
      where d.jobid = v_job.jobid
        and d.status = 'succeeded'
        and d.end_time >= now() - interval '15 minutes'
    ) into v_has_recent_success;

    if v_has_recent_success then
      update private.cron_job_health
      set recovered_at = now()
      where job_name = v_job.jobname
        and recovered_at is null;
      continue;
    end if;

    insert into private.cron_job_health (job_name)
    values (v_job.jobname)
    on conflict (job_name) do update
    set outage_started_at = case
          when private.cron_job_health.recovered_at is not null then now()
          else private.cron_job_health.outage_started_at
        end,
        alerted_at = case
          when private.cron_job_health.recovered_at is not null then null
          else private.cron_job_health.alerted_at
        end,
        recovered_at = null;

    select * into v_state
    from private.cron_job_health
    where job_name = v_job.jobname;

    if v_state.alerted_at is null then
      for v_admin in
        select p.id from public.profiles p where p.role_global = 'admin'
      loop
        insert into public.notifications (user_id, type, payload)
        values (
          v_admin.id,
          'cron_job_stale',
          jsonb_build_object(
            'job_name', v_job.jobname,
            'outage_started_at', v_state.outage_started_at
          )
        );
      end loop;
      update private.cron_job_health
      set alerted_at = now()
      where job_name = v_job.jobname;
      v_alerted := v_alerted + 1;
    end if;
  end loop;
  return v_alerted;
end;
$$;

revoke all on function public.remind_pending_declarations()
  from public, anon, authenticated;
revoke all on function public.process_aggregator_webhook(text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.reconcile_stale_aggregator_payments()
  from public, anon, authenticated;
revoke all on function public.monitor_order_cron_jobs()
  from public, anon, authenticated;
grant execute on function public.remind_pending_declarations() to service_role;
grant execute on function public.process_aggregator_webhook(text, text, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.reconcile_stale_aggregator_payments() to service_role;
grant execute on function public.monitor_order_cron_jobs() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'expire-pending-orders',
  'remind-pending-declarations',
  'reconcile-stale-aggregator-payments',
  'monitor-order-cron-jobs'
);

select cron.schedule(
  'expire-pending-orders',
  '*/5 * * * *',
  'select public.expire_pending_orders();'
);
select cron.schedule(
  'remind-pending-declarations',
  '*/5 * * * *',
  'select public.remind_pending_declarations();'
);
select cron.schedule(
  'reconcile-stale-aggregator-payments',
  '*/5 * * * *',
  'select public.reconcile_stale_aggregator_payments();'
);
select cron.schedule(
  'monitor-order-cron-jobs',
  '*/5 * * * *',
  'select public.monitor_order_cron_jobs();'
);
