-- Le catalogue contient des prix : les mutations passent par des RPC qui
-- vérifient les permissions et la boutique concernée.
create or replace function public.save_catalog_product(
  p_shop uuid,
  p_product_id uuid,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_price integer,
  p_compare_at_price integer,
  p_sku text,
  p_compatibility text,
  p_stock integer,
  p_status public.product_status,
  p_variants jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_variant jsonb; v_variant_id uuid; v_variant_ids uuid[] := '{}';
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_product_id is null then
    insert into public.products (
      shop_id, category_id, name, description, price, compare_at_price,
      sku, compatibility, stock, status
    ) values (
      p_shop, p_category_id, btrim(p_name), nullif(btrim(p_description), ''),
      p_price, p_compare_at_price, nullif(btrim(p_sku), ''),
      nullif(btrim(p_compatibility), ''), p_stock, p_status
    ) returning id into v_id;
  else
    update public.products set
      category_id = p_category_id,
      name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      price = p_price,
      compare_at_price = p_compare_at_price,
      sku = nullif(btrim(p_sku), ''),
      compatibility = nullif(btrim(p_compatibility), ''),
      stock = p_stock,
      status = p_status
    where id = p_product_id and shop_id = p_shop and deleted_at is null
    returning id into v_id;

    if v_id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'invalid_variants';
  end if;

  for v_variant in select value from jsonb_array_elements(p_variants)
  loop
    if jsonb_typeof(v_variant) <> 'object'
      or coalesce(char_length(btrim(v_variant ->> 'name')), 0) not between 1 and 80
      or (v_variant ->> 'price') is not null
         and (v_variant ->> 'price') !~ '^[0-9]{1,10}$'
      or (v_variant ->> 'stock') is not null
         and (v_variant ->> 'stock') !~ '^[0-9]{1,10}$'
    then
      raise exception 'invalid_variant';
    end if;

    v_variant_id := nullif(v_variant ->> 'id', '')::uuid;
    if v_variant_id is null then
      insert into public.product_variants (shop_id, product_id, name, price, stock)
      values (
        p_shop, v_id, btrim(v_variant ->> 'name'),
        nullif(v_variant ->> 'price', '')::integer,
        nullif(v_variant ->> 'stock', '')::integer
      ) returning id into v_variant_id;
    else
      update public.product_variants set
        name = btrim(v_variant ->> 'name'),
        price = nullif(v_variant ->> 'price', '')::integer,
        stock = nullif(v_variant ->> 'stock', '')::integer
      where id = v_variant_id and product_id = v_id and shop_id = p_shop;
      if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;
    end if;
    v_variant_ids := array_append(v_variant_ids, v_variant_id);
  end loop;

  if exists (
    select 1 from public.cart_items ci
    join public.product_variants pv on pv.id = ci.variant_id and pv.shop_id = ci.shop_id
    where pv.product_id = v_id and pv.shop_id = p_shop
      and not (pv.id = any(v_variant_ids))
  ) then
    raise exception 'variant_in_cart';
  end if;
  delete from public.product_variants
  where product_id = v_id and shop_id = p_shop
    and not (id = any(v_variant_ids));

  return v_id;
end $$;

create or replace function public.save_catalog_variant(
  p_shop uuid,
  p_product uuid,
  p_variant_id uuid,
  p_name text,
  p_price integer,
  p_stock integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.products
    where id = p_product and shop_id = p_shop and deleted_at is null
  ) then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if p_variant_id is null then
    insert into public.product_variants (shop_id, product_id, name, price, stock)
    values (p_shop, p_product, btrim(p_name), p_price, p_stock)
    returning id into v_id;
  else
    update public.product_variants set
      name = btrim(p_name), price = p_price, stock = p_stock
    where id = p_variant_id and product_id = p_product and shop_id = p_shop
    returning id into v_id;
    if v_id is null then
      raise exception 'variant_not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_catalog_variant(
  p_shop uuid,
  p_product uuid,
  p_variant_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.cart_items
    where variant_id = p_variant_id and shop_id = p_shop
  ) then
    raise exception 'variant_in_cart';
  end if;
  delete from public.product_variants
  where id = p_variant_id and product_id = p_product and shop_id = p_shop;
  if not found then
    raise exception 'variant_not_found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.save_catalog_service(
  p_shop uuid,
  p_service_id uuid,
  p_name text,
  p_description text,
  p_duration_min integer,
  p_price integer,
  p_deposit_amount integer,
  p_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_service_id is null then
    insert into public.services (
      shop_id, name, description, duration_min, price, deposit_amount, active
    ) values (
      p_shop, btrim(p_name), nullif(btrim(p_description), ''),
      p_duration_min, p_price, p_deposit_amount, p_active
    ) returning id into v_id;
  else
    update public.services set
      name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      duration_min = p_duration_min,
      price = p_price,
      deposit_amount = p_deposit_amount,
      active = p_active
    where id = p_service_id and shop_id = p_shop and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'service_not_found' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $$;

create or replace function public.set_catalog_item_deleted(
  p_shop uuid,
  p_kind text,
  p_item_id uuid,
  p_deleted boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_deleted_at timestamptz; v_max integer; v_count integer;
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('product', 'service') then
    raise exception 'invalid_catalog_item';
  end if;

  if p_kind = 'product' then
    select deleted_at into v_deleted_at from public.products
    where id = p_item_id and shop_id = p_shop for update;
    if not found then raise exception 'product_not_found' using errcode = 'P0002'; end if;

    if p_deleted then
      update public.products set deleted_at = coalesce(deleted_at, now())
      where id = p_item_id and shop_id = p_shop;
    else
      if v_deleted_at is null then return; end if;
      if v_deleted_at < now() - interval '30 days' then
        raise exception 'restoration_expired';
      end if;
      v_max := (private.plan_limits(p_shop) ->> 'max_products')::integer;
      if v_max is not null then
        select count(*) into v_count from public.products
        where shop_id = p_shop and deleted_at is null and not is_sample;
        if v_count >= v_max then raise exception 'plan_limit_products'; end if;
      end if;
      update public.products set deleted_at = null
      where id = p_item_id and shop_id = p_shop;
    end if;
  else
    select deleted_at into v_deleted_at from public.services
    where id = p_item_id and shop_id = p_shop for update;
    if not found then raise exception 'service_not_found' using errcode = 'P0002'; end if;
    if p_deleted then
      update public.services set deleted_at = coalesce(deleted_at, now())
      where id = p_item_id and shop_id = p_shop;
    else
      if v_deleted_at is null then return; end if;
      if v_deleted_at < now() - interval '30 days' then
        raise exception 'restoration_expired';
      end if;
      update public.services set deleted_at = null
      where id = p_item_id and shop_id = p_shop;
    end if;
  end if;
end $$;

create or replace function public.search_catalog_products(
  p_shop uuid,
  p_query text
) returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id from public.products p
  where p.shop_id = p_shop and p.deleted_at is null
    and (
      coalesce(btrim(p_query), '') = ''
      or p.search_vector @@ websearch_to_tsquery('french', extensions.unaccent(btrim(p_query)))
      or p.name ilike '%' || btrim(p_query) || '%'
    )
  order by p.created_at desc;
end $$;

create or replace function public.catalog_product_limit(p_shop uuid)
returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (private.plan_limits(p_shop) ->> 'max_products')::integer;
end $$;

create or replace function private.prevent_category_cycle()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is null then return new; end if;
  if new.id = new.parent_id then raise exception 'category_cycle'; end if;
  if exists (
    with recursive ancestors(id, parent_id, visited) as (
      select c.id, c.parent_id, array[c.id]
      from public.categories c
      where c.id = new.parent_id and c.shop_id = new.shop_id
      union all
      select c.id, c.parent_id, a.visited || c.id
      from public.categories c
      join ancestors a on c.id = a.parent_id and c.shop_id = new.shop_id
      where not c.id = any(a.visited)
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'category_cycle';
  end if;
  return new;
end $$;

create trigger categories_prevent_cycle
before insert or update of parent_id on public.categories
for each row execute function private.prevent_category_cycle();

revoke insert (shop_id, category_id, name, description, price, compare_at_price, sku,
               compatibility, stock, status, is_sample, deleted_at)
  on public.products from authenticated;
revoke update (category_id, name, description, price, compare_at_price, sku,
               compatibility, stock, status, is_sample, deleted_at)
  on public.products from authenticated;
revoke delete on public.products from authenticated;
revoke insert, update, delete on public.services, public.product_variants from authenticated;

revoke execute on function public.save_catalog_product(uuid, uuid, uuid, text, text, integer, integer, text, text, integer, public.product_status, jsonb) from public, anon;
revoke execute on function public.save_catalog_variant(uuid, uuid, uuid, text, integer, integer) from public, anon;
revoke execute on function public.delete_catalog_variant(uuid, uuid, uuid) from public, anon;
revoke execute on function public.save_catalog_service(uuid, uuid, text, text, integer, integer, integer, boolean) from public, anon;
revoke execute on function public.set_catalog_item_deleted(uuid, text, uuid, boolean) from public, anon;
revoke execute on function public.search_catalog_products(uuid, text) from public, anon;
revoke execute on function public.catalog_product_limit(uuid) from public, anon;
grant execute on function public.save_catalog_product(uuid, uuid, uuid, text, text, integer, integer, text, text, integer, public.product_status, jsonb) to authenticated;
grant execute on function public.save_catalog_variant(uuid, uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.delete_catalog_variant(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_catalog_service(uuid, uuid, text, text, integer, integer, integer, boolean) to authenticated;
grant execute on function public.set_catalog_item_deleted(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.search_catalog_products(uuid, text) to authenticated;
grant execute on function public.catalog_product_limit(uuid) to authenticated;
