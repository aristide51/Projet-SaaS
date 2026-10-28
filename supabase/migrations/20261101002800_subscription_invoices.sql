create unique index invoices_shop_period_unique
  on public.invoices (shop_id, period_start, period_end);

create or replace function public.generate_due_invoices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_created integer;
begin
  if private.jwt_role() not in ('service_role', 'none') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.invoices (
    shop_id,
    plan_id,
    amount,
    status,
    period_start,
    period_end,
    due_at
  )
  select
    subscription.shop_id,
    subscription.plan_id,
    plan.price_monthly,
    'open',
    subscription.current_period_end - interval '1 month',
    subscription.current_period_end,
    subscription.current_period_end
  from public.subscriptions subscription
  join public.plans plan on plan.id = subscription.plan_id
  where subscription.status = 'active'
    and plan.price_monthly > 0
    and subscription.current_period_end > v_now
    and subscription.current_period_end <= v_now + interval '7 days'
  order by subscription.shop_id
  on conflict (shop_id, period_start, period_end) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;
revoke all on function public.generate_due_invoices()
  from public, anon, authenticated, service_role;
grant execute on function public.generate_due_invoices() to service_role;

select cron.schedule(
  'generate-due-invoices',
  '15 0 * * *',
  'select public.generate_due_invoices();'
);
