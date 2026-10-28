create table public.public_storefront_visit_counts (
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid,
  visit_date date not null,
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (shop_id, visit_date, product_id),
  foreign key (product_id, shop_id)
    references public.products (id, shop_id) on delete cascade
);

alter table public.public_storefront_visit_counts enable row level security;
revoke all on public.public_storefront_visit_counts from public, anon, authenticated;

create or replace function public.record_public_storefront_visit(
  p_shop_id uuid,
  p_product_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.review_status = 'approved'
      and not s.is_suspended
  ) then
    raise exception 'shop_not_public';
  end if;

  if p_product_id is not null and not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.shop_id = p_shop_id
      and p.status <> 'hidden'
      and not p.is_sample
      and p.deleted_at is null
      and not p.hidden_by_plan
  ) then
    raise exception 'product_not_public';
  end if;

  insert into public.public_storefront_visit_counts (
    shop_id, product_id, visit_date, view_count
  )
  values (
    p_shop_id,
    p_product_id,
    (now() at time zone 'Africa/Ouagadougou')::date,
    1
  )
  on conflict (shop_id, visit_date, product_id)
  do update set
    view_count = public.public_storefront_visit_counts.view_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.record_public_storefront_visit(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_public_storefront_visit(uuid, uuid)
  to anon, authenticated;
