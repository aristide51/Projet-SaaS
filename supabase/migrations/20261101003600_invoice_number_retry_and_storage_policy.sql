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

  perform 1
  from private.invoice_number_counter
  where singleton
  for update;
  if not found then
    raise exception 'invoice_number_counter_missing';
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
    and not exists (
      select 1
      from public.invoices existing
      where existing.shop_id = subscription.shop_id
        and existing.period_start =
          subscription.current_period_end - interval '1 month'
        and existing.period_end = subscription.current_period_end
    )
  order by subscription.shop_id;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

revoke all on function public.generate_due_invoices()
  from public, anon, authenticated, service_role;
grant execute on function public.generate_due_invoices() to service_role;

drop policy subscription_receipts_read on storage.objects;
create policy subscription_receipts_read
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'subscription-receipts'
    and exists (
      select 1
      from public.invoices invoice
      where invoice.pdf_path = storage.objects.name
        and invoice.shop_id::text = (storage.foldername(storage.objects.name))[1]
        and storage.filename(storage.objects.name) = invoice.id::text || '.pdf'
        and (
          private.is_shop_owner(invoice.shop_id)
          or private.is_admin()
        )
    )
  );

create or replace function private.protect_invoice_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoice_delete_forbidden' using errcode = 'P0001';
  end if;
  if new.invoice_number is distinct from old.invoice_number then
    raise exception 'invoice_number_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_invoice_identity()
  from public, anon, authenticated, service_role;

create trigger invoices_number_immutable
  before update of invoice_number on public.invoices
  for each row execute function private.protect_invoice_identity();
create trigger invoices_delete_forbidden
  before delete on public.invoices
  for each row execute function private.protect_invoice_identity();
