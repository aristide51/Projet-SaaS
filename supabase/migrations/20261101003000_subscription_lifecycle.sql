alter table public.products
  add column hidden_by_plan boolean not null default false;

grant select (hidden_by_plan) on public.products to authenticated;

drop policy products_select on public.products;
create policy products_select on public.products for select to anon, authenticated
  using (
    (private.is_shop_public(shop_id) and status <> 'hidden'
      and deleted_at is null and not hidden_by_plan)
    or private.is_shop_member(shop_id)
    or private.is_admin()
  );

create table private.subscription_reminder_deliveries (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_end timestamptz not null,
  reminder_key text not null check (reminder_key in ('7_days', '3_days', 'due')),
  sent_at timestamptz not null default now(),
  primary key (shop_id, user_id, period_end, reminder_key)
);
revoke all on private.subscription_reminder_deliveries
  from public, anon, authenticated, service_role;

create or replace function private.sync_shop_plan_products(p_shop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_products integer;
begin
  v_max_products := (
    private.plan_limits(p_shop) ->> 'max_products'
  )::integer;

  with ranked as (
    select p.id,
      row_number() over (order by p.created_at, p.id) as position
    from public.products p
    where p.shop_id = p_shop
      and p.deleted_at is null
      and not p.is_sample
  )
  update public.products p
  set hidden_by_plan = coalesce(r.position > v_max_products, false)
  from (
    select product.id,
      product.deleted_at,
      product.is_sample,
      ranked.position
    from public.products product
    left join ranked on ranked.id = product.id
    where product.shop_id = p_shop
  ) r
  where p.id = r.id
    and p.shop_id = p_shop
    and p.hidden_by_plan is distinct from (
      r.deleted_at is null
      and not r.is_sample
      and v_max_products is not null
      and r.position > v_max_products
    );
end;
$$;

revoke all on function private.sync_shop_plan_products(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.sync_subscription_plan_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_shop_plan_products(new.shop_id);
  return new;
end;
$$;

create trigger subscriptions_sync_plan_products
  after update of plan_id, status on public.subscriptions
  for each row
  when (
    old.plan_id is distinct from new.plan_id
    or old.status is distinct from new.status
  )
  execute function private.sync_subscription_plan_products();

create or replace function private.sync_products_after_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_shop_plan_products(new.shop_id);
  return new;
end;
$$;

revoke all on function private.sync_subscription_plan_products()
  from public, anon, authenticated, service_role;
revoke all on function private.sync_products_after_archive()
  from public, anon, authenticated, service_role;

create trigger products_sync_plan_visibility
  after update of deleted_at on public.products
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function private.sync_products_after_archive();

create or replace function public.process_subscription_lifecycle()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_subscription record;
  v_reminder record;
  v_delivery_shop uuid;
  v_processed integer := 0;
begin
  if private.jwt_role() not in ('service_role', 'none') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_subscription in
    update public.subscriptions
    set status = 'past_due',
        grace_until = current_period_end + interval '7 days'
    where status = 'active'
      and current_period_end is not null
      and current_period_end <= v_now
    returning shop_id, current_period_end, grace_until
  loop
    perform private.write_audit(
      v_subscription.shop_id,
      'subscription.past_due',
      'subscriptions',
      v_subscription.shop_id,
      jsonb_build_object(
        'current_period_end', v_subscription.current_period_end,
        'grace_until', v_subscription.grace_until
      )
    );
    v_processed := v_processed + 1;
  end loop;

  for v_reminder in
    select
      subscription.shop_id,
      member.user_id,
      subscription.current_period_end,
      reminder.reminder_key
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    join public.shop_members member
      on member.shop_id = subscription.shop_id
      and member.role = 'owner'
    cross join lateral (
      values
        (
          '7_days'::text,
          subscription.current_period_end > v_now + interval '6 days'
            and subscription.current_period_end <= v_now + interval '7 days'
        ),
        (
          '3_days'::text,
          subscription.current_period_end > v_now + interval '2 days'
            and subscription.current_period_end <= v_now + interval '3 days'
        ),
        ('due'::text, subscription.current_period_end <= v_now)
    ) reminder(reminder_key, is_due)
    where plan.price_monthly > 0
      and subscription.current_period_end is not null
      and subscription.status in ('active', 'past_due')
      and reminder.is_due
    order by subscription.shop_id, member.user_id, reminder.reminder_key
  loop
    insert into private.subscription_reminder_deliveries (
      shop_id, user_id, period_end, reminder_key
    )
    values (
      v_reminder.shop_id,
      v_reminder.user_id,
      v_reminder.current_period_end,
      v_reminder.reminder_key
    )
    on conflict do nothing
    returning shop_id into v_delivery_shop;

    if v_delivery_shop is null then
      continue;
    end if;

    insert into public.notifications (user_id, type, payload)
    values (
      v_reminder.user_id,
      'subscription_reminder',
      jsonb_build_object(
        'shop_id', v_reminder.shop_id,
        'reminder_key', v_reminder.reminder_key,
        'current_period_end', v_reminder.current_period_end
      )
    );
    v_processed := v_processed + 1;
    v_delivery_shop := null;
  end loop;

  for v_subscription in
    update public.subscriptions
    set status = 'expired'
    where status = 'past_due'
      and grace_until is not null
      and grace_until <= v_now
    returning shop_id, grace_until
  loop
    perform private.write_audit(
      v_subscription.shop_id,
      'subscription.expired',
      'subscriptions',
      v_subscription.shop_id,
      jsonb_build_object('grace_until', v_subscription.grace_until)
    );
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.process_subscription_lifecycle()
  from public, anon, authenticated, service_role;
grant execute on function public.process_subscription_lifecycle()
  to service_role;

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
     and new.type <> 'subscription_reminder'
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
      ('reconcile-stale-aggregator-payments'),
      ('process-subscription-lifecycle')
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

revoke all on function public.monitor_order_cron_jobs()
  from public, anon, authenticated, service_role;
grant execute on function public.monitor_order_cron_jobs()
  to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname in ('process-subscription-lifecycle', 'monitor-order-cron-jobs');

select cron.schedule(
  'process-subscription-lifecycle',
  '*/5 * * * *',
  'select public.process_subscription_lifecycle();'
);
select cron.schedule(
  'monitor-order-cron-jobs',
  '*/5 * * * *',
  'select public.monitor_order_cron_jobs();'
);
