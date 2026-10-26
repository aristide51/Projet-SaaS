create extension if not exists pgcrypto with schema extensions;

create table public.guest_carts (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  unique (shop_id, token_hash)
);

create table public.guest_cart_items (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null,
  cart_id    uuid not null,
  product_id uuid not null,
  variant_id uuid,
  quantity   integer not null check (quantity between 1 and 99),
  foreign key (cart_id, shop_id)
    references public.guest_carts(id, shop_id) on delete cascade,
  foreign key (product_id, shop_id)
    references public.products(id, shop_id) on delete cascade,
  foreign key (variant_id, shop_id)
    references public.product_variants(id, shop_id) on delete cascade
);

create unique index guest_cart_items_unique_line
  on public.guest_cart_items (
    cart_id,
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index guest_carts_expiration_idx on public.guest_carts (expires_at);

alter table public.guest_carts enable row level security;
alter table public.guest_cart_items enable row level security;
revoke all on public.guest_carts, public.guest_cart_items from anon, authenticated;
grant all on public.guest_carts, public.guest_cart_items to service_role;

revoke insert, update, delete on public.carts, public.cart_items from authenticated;
drop policy if exists cart_items_all on public.cart_items;
create policy cart_items_own on public.cart_items for all to authenticated
  using (exists (
    select 1 from public.carts c
    where c.id = cart_id and c.customer_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.carts c
    where c.id = cart_id and c.customer_id = (select auth.uid())
  ));

create or replace function private.validate_cart_token(p_token text)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_guest_cart_token' using errcode = '22023';
  end if;
  return extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
end $$;

create or replace function public.get_cart_snapshot(
  p_shop uuid,
  p_guest_token text default null
)
returns table (
  cart_id uuid,
  item_id uuid,
  product_id uuid,
  variant_id uuid,
  product_name text,
  variant_name text,
  quantity integer,
  unit_price integer,
  status text,
  can_order boolean,
  stock_limited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token_hash bytea;
begin
  if not private.is_shop_public(p_shop) then
    return;
  end if;

  if v_user is null then
    if p_guest_token is null then
      return;
    end if;
    v_token_hash := private.validate_cart_token(p_guest_token);

    return query
      select
        gc.id,
        ci.id,
        p.id,
        ci.variant_id,
        case when p.deleted_at is null and not p.is_sample then p.name else 'Article indisponible' end,
        v.name,
        ci.quantity,
        coalesce(v.price, p.price),
        p.status::text,
        p.deleted_at is null
          and not p.is_sample
          and p.status = 'available'
          and (ci.variant_id is null or v.id is not null)
          and case
            when ci.variant_id is null then p.stock is null or p.stock >= ci.quantity
            else v.stock is null or v.stock >= ci.quantity
          end,
        case when ci.variant_id is null then p.stock is not null else v.stock is not null end
      from public.guest_carts gc
      join public.guest_cart_items ci on ci.cart_id = gc.id and ci.shop_id = gc.shop_id
      join public.products p on p.id = ci.product_id and p.shop_id = ci.shop_id
      left join public.product_variants v
        on v.id = ci.variant_id and v.shop_id = ci.shop_id and v.product_id = p.id
      where gc.shop_id = p_shop
        and gc.token_hash = v_token_hash
        and gc.expires_at > now()
      order by ci.id;
    return;
  end if;

  return query
    select
      c.id,
      ci.id,
      p.id,
      ci.variant_id,
      case when p.deleted_at is null and not p.is_sample then p.name else 'Article indisponible' end,
      v.name,
      ci.quantity,
      coalesce(v.price, p.price),
      p.status::text,
      p.deleted_at is null
        and not p.is_sample
        and p.status = 'available'
        and (ci.variant_id is null or v.id is not null)
        and case
          when ci.variant_id is null then p.stock is null or p.stock >= ci.quantity
          else v.stock is null or v.stock >= ci.quantity
        end,
      case when ci.variant_id is null then p.stock is not null else v.stock is not null end
    from public.carts c
    join public.cart_items ci on ci.cart_id = c.id and ci.shop_id = c.shop_id
    join public.products p on p.id = ci.product_id and p.shop_id = ci.shop_id
    left join public.product_variants v
      on v.id = ci.variant_id and v.shop_id = ci.shop_id and v.product_id = p.id
    where c.shop_id = p_shop and c.customer_id = v_user
    order by ci.id;
end $$;

create or replace function private.add_cart_line(
  p_cart uuid,
  p_shop uuid,
  p_product uuid,
  p_variant uuid,
  p_quantity integer,
  p_guest boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_variant public.product_variants;
  v_line_id uuid;
  v_existing_quantity integer := 0;
  v_next_quantity integer;
begin
  if p_quantity is null or p_quantity not between 1 and 99 then
    raise exception 'invalid_cart_quantity' using errcode = '22023';
  end if;
  if not private.is_shop_public(p_shop) then
    raise exception 'shop_not_available' using errcode = 'P0001';
  end if;

  select * into v_product
  from public.products p
  where p.id = p_product and p.shop_id = p_shop
  for update;
  if not found or v_product.deleted_at is not null or v_product.is_sample
     or v_product.status <> 'available' then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;

  if p_variant is not null then
    select * into v_variant
    from public.product_variants v
    where v.id = p_variant and v.shop_id = p_shop and v.product_id = p_product
    for update;
    if not found then
      raise exception 'variant_unavailable' using errcode = 'P0001';
    end if;
  end if;

  if p_guest then
    select ci.id, ci.quantity into v_line_id, v_existing_quantity
    from public.guest_cart_items ci
    where ci.cart_id = p_cart and ci.product_id = p_product
      and coalesce(ci.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_variant, '00000000-0000-0000-0000-000000000000'::uuid)
    for update;
  else
    select ci.id, ci.quantity into v_line_id, v_existing_quantity
    from public.cart_items ci
    where ci.cart_id = p_cart and ci.product_id = p_product
      and coalesce(ci.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_variant, '00000000-0000-0000-0000-000000000000'::uuid)
    for update;
  end if;

  v_next_quantity := coalesce(v_existing_quantity, 0) + p_quantity;
  if v_next_quantity > 99 then
    raise exception 'cart_quantity_limit' using errcode = 'P0001';
  end if;
  if p_variant is not null and v_variant.stock is not null
     and v_next_quantity > v_variant.stock then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  elsif p_variant is null and v_product.stock is not null
        and v_next_quantity > v_product.stock then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  if v_line_id is not null then
    if p_guest then
      update public.guest_cart_items set quantity = v_next_quantity where id = v_line_id;
    else
      update public.cart_items set quantity = v_next_quantity where id = v_line_id;
    end if;
    return v_line_id;
  end if;

  if p_guest then
    insert into public.guest_cart_items (cart_id, shop_id, product_id, variant_id, quantity)
    values (p_cart, p_shop, p_product, p_variant, p_quantity)
    returning id into v_line_id;
  else
    insert into public.cart_items (cart_id, shop_id, product_id, variant_id, quantity)
    values (p_cart, p_shop, p_product, p_variant, p_quantity)
    returning id into v_line_id;
  end if;

  return v_line_id;
end $$;

create or replace function public.add_cart_item(
  p_shop uuid,
  p_product uuid,
  p_variant uuid default null,
  p_quantity integer default 1,
  p_guest_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_cart uuid;
  v_guest boolean := false;
  v_token_hash bytea;
begin
  if v_user is null then
    v_token_hash := private.validate_cart_token(p_guest_token);
    insert into public.guest_carts (shop_id, token_hash)
    values (p_shop, v_token_hash)
    on conflict (shop_id, token_hash) do update
      set expires_at = now() + interval '30 days', updated_at = now()
    returning id into v_cart;
    v_guest := true;
  else
    insert into public.carts (shop_id, customer_id)
    values (p_shop, v_user)
    on conflict (shop_id, customer_id) do update set shop_id = excluded.shop_id
    returning id into v_cart;
  end if;

  return private.add_cart_line(
    v_cart, p_shop, p_product, p_variant, p_quantity, v_guest
  );
end $$;

create or replace function public.set_cart_item_quantity(
  p_shop uuid,
  p_item uuid,
  p_quantity integer,
  p_guest_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_product public.products;
  v_variant public.product_variants;
  v_guest_cart uuid;
begin
  if p_quantity is null or p_quantity not between 1 and 99 then
    raise exception 'invalid_cart_quantity' using errcode = '22023';
  end if;
  if not private.is_shop_public(p_shop) then
    raise exception 'shop_not_available' using errcode = 'P0001';
  end if;

  if v_user is null then
    select gc.id into v_guest_cart
    from public.guest_carts gc
    where gc.shop_id = p_shop
      and gc.token_hash = private.validate_cart_token(p_guest_token)
      and gc.expires_at > now();
    if not found then
      raise exception 'cart_item_not_found' using errcode = 'P0002';
    end if;

    select p.* into v_product
    from public.guest_cart_items ci
    join public.products p on p.id = ci.product_id and p.shop_id = ci.shop_id
    where ci.id = p_item and ci.cart_id = v_guest_cart and ci.shop_id = p_shop
    for update of p;
  else
    select p.* into v_product
    from public.cart_items ci
    join public.carts c on c.id = ci.cart_id and c.shop_id = ci.shop_id
    join public.products p on p.id = ci.product_id and p.shop_id = ci.shop_id
    where ci.id = p_item and ci.shop_id = p_shop and c.customer_id = v_user
    for update of p;
  end if;
  if not found then
    raise exception 'cart_item_not_found' using errcode = 'P0002';
  end if;
  if v_product.deleted_at is not null or v_product.is_sample or v_product.status <> 'available' then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;

  if v_user is null then
    select v.* into v_variant
    from public.guest_cart_items ci
    left join public.product_variants v
      on v.id = ci.variant_id and v.shop_id = ci.shop_id and v.product_id = ci.product_id
    where ci.id = p_item and ci.cart_id = v_guest_cart and ci.shop_id = p_shop;
  else
    select v.* into v_variant
    from public.cart_items ci
    left join public.product_variants v
      on v.id = ci.variant_id and v.shop_id = ci.shop_id and v.product_id = ci.product_id
    join public.carts c on c.id = ci.cart_id and c.shop_id = ci.shop_id
    where ci.id = p_item and ci.shop_id = p_shop and c.customer_id = v_user;
  end if;

  if v_variant.id is not null and v_variant.stock is not null and p_quantity > v_variant.stock then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  elsif v_variant.id is null and v_product.stock is not null and p_quantity > v_product.stock then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  if v_user is null then
    update public.guest_cart_items set quantity = p_quantity
    where id = p_item and cart_id = v_guest_cart and shop_id = p_shop;
  else
    update public.cart_items ci set quantity = p_quantity
    from public.carts c
    where ci.id = p_item and ci.shop_id = p_shop and c.id = ci.cart_id
      and c.customer_id = v_user;
  end if;
end $$;

create or replace function public.remove_cart_item(
  p_shop uuid,
  p_item uuid,
  p_guest_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_guest_cart uuid;
begin
  if v_user is null then
    select gc.id into v_guest_cart
    from public.guest_carts gc
    where gc.shop_id = p_shop
      and gc.token_hash = private.validate_cart_token(p_guest_token)
      and gc.expires_at > now();
    if not found then
      raise exception 'cart_item_not_found' using errcode = 'P0002';
    end if;

    delete from public.guest_cart_items
    where id = p_item and cart_id = v_guest_cart and shop_id = p_shop;
  else
    delete from public.cart_items ci
    using public.carts c
    where ci.id = p_item and ci.shop_id = p_shop and c.id = ci.cart_id
      and c.customer_id = v_user;
  end if;

  if not found then
    raise exception 'cart_item_not_found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.merge_guest_carts(p_guest_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token_hash bytea := private.validate_cart_token(p_guest_token);
  v_guest record;
  v_cart uuid;
  v_count integer := 0;
begin
  if v_user is null or not exists (
    select 1 from auth.users u
    where u.id = v_user and u.email_confirmed_at is not null
  ) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  for v_guest in
    select gc.id, gc.shop_id
    from public.guest_carts gc
    where gc.token_hash = v_token_hash and gc.expires_at > now()
    for update
  loop
    insert into public.carts (shop_id, customer_id)
    values (v_guest.shop_id, v_user)
    on conflict (shop_id, customer_id) do update set shop_id = excluded.shop_id
    returning id into v_cart;

    insert into public.cart_items (cart_id, shop_id, product_id, variant_id, quantity)
    select v_cart, ci.shop_id, ci.product_id, ci.variant_id, ci.quantity
    from public.guest_cart_items ci
    where ci.cart_id = v_guest.id and ci.shop_id = v_guest.shop_id
    on conflict (
      cart_id,
      product_id,
      (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    ) do update set quantity = least(99, public.cart_items.quantity + excluded.quantity);

    delete from public.guest_carts where id = v_guest.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function private.validate_cart_token(text) from public, anon, authenticated;
revoke all on function private.add_cart_line(uuid, uuid, uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_cart_snapshot(uuid, text) from public, anon, authenticated;
revoke all on function public.add_cart_item(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.set_cart_item_quantity(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.remove_cart_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.merge_guest_carts(text) from public, anon, authenticated;
grant execute on function public.get_cart_snapshot(uuid, text) to anon, authenticated;
grant execute on function public.add_cart_item(uuid, uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.set_cart_item_quantity(uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.remove_cart_item(uuid, uuid, text) to anon, authenticated;
grant execute on function public.merge_guest_carts(text) to authenticated;
