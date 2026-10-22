drop function public.save_catalog_product(
  uuid, uuid, uuid, text, text, integer, integer, text, text, integer,
  public.product_status, jsonb
);
drop function public.save_catalog_service(
  uuid, uuid, text, text, integer, integer, integer, boolean
);

create function public.save_catalog_product(
  p_shop uuid,
  p_product jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_product_id uuid;
  v_variant jsonb;
  v_variant_id uuid;
  v_variant_ids uuid[] := '{}';
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception 'invalid_product';
  end if;

  v_product_id := nullif(p_product ->> 'id', '')::uuid;

  if v_product_id is null then
    insert into public.products (
      shop_id, category_id, name, description, price, compare_at_price,
      sku, compatibility, stock, status
    ) values (
      p_shop,
      nullif(p_product ->> 'category_id', '')::uuid,
      btrim(p_product ->> 'name'),
      nullif(btrim(p_product ->> 'description'), ''),
      nullif(p_product ->> 'price', '')::integer,
      nullif(p_product ->> 'compare_at_price', '')::integer,
      nullif(btrim(p_product ->> 'sku'), ''),
      nullif(btrim(p_product ->> 'compatibility'), ''),
      nullif(p_product ->> 'stock', '')::integer,
      coalesce(nullif(p_product ->> 'status', ''), 'available')::public.product_status
    ) returning id into v_id;
  else
    update public.products set
      category_id = nullif(p_product ->> 'category_id', '')::uuid,
      name = btrim(p_product ->> 'name'),
      description = nullif(btrim(p_product ->> 'description'), ''),
      price = nullif(p_product ->> 'price', '')::integer,
      compare_at_price = nullif(p_product ->> 'compare_at_price', '')::integer,
      sku = nullif(btrim(p_product ->> 'sku'), ''),
      compatibility = nullif(btrim(p_product ->> 'compatibility'), ''),
      stock = nullif(p_product ->> 'stock', '')::integer,
      status = coalesce(nullif(p_product ->> 'status', ''), 'available')::public.product_status
    where id = v_product_id and shop_id = p_shop and deleted_at is null
    returning id into v_id;

    if v_id is null then
      raise exception 'product_not_found' using errcode = 'P0002';
    end if;
  end if;

  if p_product -> 'variants' is null
    or jsonb_typeof(p_product -> 'variants') <> 'array' then
    raise exception 'invalid_variants';
  end if;

  for v_variant in select value from jsonb_array_elements(p_product -> 'variants')
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

create function public.save_catalog_service(
  p_shop uuid,
  p_service jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_service_id uuid;
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_service is null or jsonb_typeof(p_service) <> 'object' then
    raise exception 'invalid_service';
  end if;

  v_service_id := nullif(p_service ->> 'id', '')::uuid;
  if v_service_id is null then
    insert into public.services (
      shop_id, name, description, duration_min, price, deposit_amount, active
    ) values (
      p_shop,
      btrim(p_service ->> 'name'),
      nullif(btrim(p_service ->> 'description'), ''),
      nullif(p_service ->> 'duration_min', '')::integer,
      nullif(p_service ->> 'price', '')::integer,
      nullif(p_service ->> 'deposit_amount', '')::integer,
      coalesce((p_service ->> 'active')::boolean, true)
    ) returning id into v_id;
  else
    update public.services set
      name = btrim(p_service ->> 'name'),
      description = nullif(btrim(p_service ->> 'description'), ''),
      duration_min = nullif(p_service ->> 'duration_min', '')::integer,
      price = nullif(p_service ->> 'price', '')::integer,
      deposit_amount = nullif(p_service ->> 'deposit_amount', '')::integer,
      active = coalesce((p_service ->> 'active')::boolean, true)
    where id = v_service_id and shop_id = p_shop and deleted_at is null
    returning id into v_id;

    if v_id is null then
      raise exception 'service_not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.catalog_trash_product_ids(p_shop uuid)
returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select id from public.products
  where shop_id = p_shop and deleted_at >= now() - interval '30 days'
  order by deleted_at desc;
end $$;

create or replace function public.catalog_trash_service_ids(p_shop uuid)
returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select id from public.services
  where shop_id = p_shop and deleted_at >= now() - interval '30 days'
  order by deleted_at desc;
end $$;

revoke execute on function public.save_catalog_product(uuid, jsonb) from public, anon;
revoke execute on function public.save_catalog_service(uuid, jsonb) from public, anon;
revoke execute on function public.catalog_trash_product_ids(uuid) from public, anon;
revoke execute on function public.catalog_trash_service_ids(uuid) from public, anon;
grant execute on function public.save_catalog_product(uuid, jsonb) to authenticated;
grant execute on function public.save_catalog_service(uuid, jsonb) to authenticated;
grant execute on function public.catalog_trash_product_ids(uuid) to authenticated;
grant execute on function public.catalog_trash_service_ids(uuid) to authenticated;
