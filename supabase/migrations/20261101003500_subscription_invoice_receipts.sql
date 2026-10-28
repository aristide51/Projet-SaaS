alter table public.invoices
  add column invoice_number bigint;

with numbered_invoices as (
  select
    id,
    row_number() over (order by created_at, id) as invoice_number
  from public.invoices
)
update public.invoices invoice
set invoice_number = numbered_invoices.invoice_number
from numbered_invoices
where numbered_invoices.id = invoice.id;

alter table public.invoices
  alter column invoice_number set not null,
  add constraint invoices_invoice_number_positive
    check (invoice_number > 0);

create unique index invoices_invoice_number_unique
  on public.invoices (invoice_number);

create table private.invoice_number_counter (
  singleton boolean primary key default true check (singleton),
  last_number bigint not null check (last_number >= 0)
);

insert into private.invoice_number_counter (singleton, last_number)
select true, coalesce(max(invoice_number), 0)
from public.invoices;

alter table private.invoice_number_counter enable row level security;
create policy invoice_number_counter_server_only
  on private.invoice_number_counter
  for all to service_role
  using (false)
  with check (false);
revoke all on private.invoice_number_counter
  from public, anon, authenticated, service_role;

create or replace function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.invoice_number_counter
  set last_number = last_number + 1
  where singleton
  returning last_number into new.invoice_number;

  if not found then
    raise exception 'invoice_number_counter_missing';
  end if;

  return new;
end;
$$;

revoke all on function private.assign_invoice_number()
  from public, anon, authenticated, service_role;

create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function private.assign_invoice_number();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'subscription-receipts',
  'subscription-receipts',
  false,
  524288,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
        and invoice.id::text = (storage.foldername(storage.objects.name))[2]
        and storage.filename(storage.objects.name) = invoice.id::text || '.pdf'
        and (
          private.is_shop_owner(invoice.shop_id)
          or private.is_admin()
        )
    )
  );
