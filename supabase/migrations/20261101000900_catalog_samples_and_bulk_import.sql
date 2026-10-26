create or replace function private.enforce_product_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max integer; v_count integer;
begin
  if tg_op = 'UPDATE' then
    if not old.is_sample or new.is_sample then return new; end if;
  elsif new.is_sample then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.shop_id::text, 0)
  );
  v_max := (private.plan_limits(new.shop_id) ->> 'max_products')::integer;
  if v_max is not null then
    select count(*) into v_count from public.products
      where shop_id = new.shop_id and deleted_at is null and not is_sample;
    if v_count >= v_max then raise exception 'plan_limit_products'; end if;
  end if;
  return new;
end $$;

drop trigger products_plan_limit on public.products;
create trigger products_plan_limit
before insert or update on public.products
for each row execute function private.enforce_product_limit();

create function private.clear_product_sample_on_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.is_sample then new.is_sample := false; end if;
  return new;
end $$;
create trigger products_clear_sample_on_edit
before update of category_id, name, description, price, compare_at_price,
                 sku, compatibility, stock, status on public.products
for each row execute function private.clear_product_sample_on_edit();

create function private.clear_service_sample_on_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.is_sample then new.is_sample := false; end if;
  return new;
end $$;
create trigger services_clear_sample_on_edit
before update of name, description, duration_min, price, deposit_amount, active
on public.services
for each row execute function private.clear_service_sample_on_edit();

drop policy products_select on public.products;
create policy products_select on public.products for select to anon, authenticated
  using ((private.is_shop_public(shop_id) and status <> 'hidden'
          and deleted_at is null and not is_sample)
         or private.is_shop_member(shop_id) or private.is_admin());

drop policy services_select on public.services;
create policy services_select on public.services for select to anon, authenticated
  using ((private.is_shop_public(shop_id) and active
          and deleted_at is null and not is_sample)
         or private.is_shop_member(shop_id) or private.is_admin());

drop policy service_images_select on public.service_images;
create policy service_images_select on public.service_images for select to anon, authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and s.shop_id = service_images.shop_id
      and (
        (private.is_shop_public(s.shop_id) and s.active
         and s.deleted_at is null and not s.is_sample)
        or private.is_shop_member(s.shop_id)
        or private.is_admin()
      )
  ));

create function public.seed_catalog_samples(p_shop uuid, p_catalog jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_product jsonb;
  v_service jsonb;
  v_category_id uuid;
  v_product_id uuid;
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_catalog is null
    or jsonb_typeof(p_catalog) <> 'object'
  then
    raise exception 'invalid_sample_catalog';
  end if;
  if jsonb_typeof(p_catalog -> 'products') <> 'array'
    or jsonb_typeof(p_catalog -> 'services') <> 'array'
  then
    raise exception 'invalid_sample_catalog';
  end if;
  if jsonb_array_length(p_catalog -> 'products') > 10
    or jsonb_array_length(p_catalog -> 'services') > 10
    or (jsonb_array_length(p_catalog -> 'products') = 0
        and jsonb_array_length(p_catalog -> 'services') = 0)
  then
    raise exception 'invalid_sample_catalog';
  end if;
  if exists (
    select 1 from public.products
    where shop_id = p_shop and is_sample and deleted_at is null
    union all
    select 1 from public.services
    where shop_id = p_shop and is_sample and deleted_at is null
  ) then
    raise exception 'sample_catalog_already_loaded';
  end if;

  for v_product in
    select value from jsonb_array_elements(p_catalog -> 'products')
  loop
    if jsonb_typeof(v_product) <> 'object' then
      raise exception 'invalid_sample_catalog';
    end if;

    v_category_id := null;
    if nullif(btrim(v_product ->> 'category_name'), '') is not null then
      select id into v_category_id
      from public.categories
      where shop_id = p_shop and name = btrim(v_product ->> 'category_name')
      limit 1;

      if v_category_id is null then
        insert into public.categories (shop_id, name)
        values (p_shop, btrim(v_product ->> 'category_name'))
        returning id into v_category_id;
      end if;
    end if;

    insert into public.products (
      shop_id, category_id, name, description, price, compare_at_price,
      sku, compatibility, stock, status, is_sample
    ) values (
      p_shop,
      v_category_id,
      btrim(v_product ->> 'name'),
      nullif(btrim(v_product ->> 'description'), ''),
      (v_product ->> 'price')::integer,
      nullif(v_product ->> 'compare_at_price', '')::integer,
      nullif(btrim(v_product ->> 'sku'), ''),
      nullif(btrim(v_product ->> 'compatibility'), ''),
      nullif(v_product ->> 'stock', '')::integer,
      coalesce(nullif(v_product ->> 'status', ''), 'available')::public.product_status,
      true
    ) returning id into v_product_id;

    if nullif(btrim(v_product ->> 'variant_name'), '') is not null then
      insert into public.product_variants (
        shop_id, product_id, name, price, stock
      ) values (
        p_shop,
        v_product_id,
        btrim(v_product ->> 'variant_name'),
        nullif(v_product ->> 'variant_price', '')::integer,
        nullif(v_product ->> 'variant_stock', '')::integer
      );
    end if;
  end loop;

  for v_service in
    select value from jsonb_array_elements(p_catalog -> 'services')
  loop
    if jsonb_typeof(v_service) <> 'object' then
      raise exception 'invalid_sample_catalog';
    end if;

    insert into public.services (
      shop_id, name, description, duration_min, price, deposit_amount, is_sample
    ) values (
      p_shop,
      btrim(v_service ->> 'name'),
      nullif(btrim(v_service ->> 'description'), ''),
      (v_service ->> 'duration_min')::integer,
      (v_service ->> 'price')::integer,
      coalesce(nullif(v_service ->> 'deposit_amount', '')::integer, 0),
      true
    );
  end loop;
end $$;

create function public.import_catalog_product_batch(p_shop uuid, p_products jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_product jsonb;
  v_category_id uuid;
  v_count integer := 0;
  v_variants jsonb;
begin
  if not private.has_shop_permission(p_shop, 'catalog') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception 'invalid_catalog_batch';
  end if;
  if jsonb_array_length(p_products) not between 1 and 50 then
    raise exception 'invalid_catalog_batch';
  end if;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    if jsonb_typeof(v_product) <> 'object' then
      raise exception 'invalid_catalog_batch';
    end if;

    v_category_id := null;
    if nullif(btrim(v_product ->> 'category_name'), '') is not null then
      select id into v_category_id
      from public.categories
      where shop_id = p_shop and name = btrim(v_product ->> 'category_name')
      limit 1;

      if v_category_id is null then
        insert into public.categories (shop_id, name)
        values (p_shop, btrim(v_product ->> 'category_name'))
        returning id into v_category_id;
      end if;
    end if;

    if nullif(btrim(v_product ->> 'variant_name'), '') is null then
      v_variants := '[]'::jsonb;
    else
      v_variants := jsonb_build_array(jsonb_build_object(
        'name', btrim(v_product ->> 'variant_name'),
        'price', nullif(v_product ->> 'variant_price', '')::integer,
        'stock', nullif(v_product ->> 'variant_stock', '')::integer
      ));
    end if;

    perform public.save_catalog_product(p_shop, jsonb_build_object(
      'name', v_product ->> 'name',
      'description', v_product ->> 'description',
      'price', v_product ->> 'price',
      'compare_at_price', v_product ->> 'compare_at_price',
      'sku', v_product ->> 'sku',
      'compatibility', v_product ->> 'compatibility',
      'stock', v_product ->> 'stock',
      'status', v_product ->> 'status',
      'category_id', v_category_id,
      'variants', v_variants
    ));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke execute on function public.seed_catalog_samples(uuid, jsonb) from public, anon;
revoke execute on function public.import_catalog_product_batch(uuid, jsonb) from public, anon;
grant execute on function public.seed_catalog_samples(uuid, jsonb) to authenticated;
grant execute on function public.import_catalog_product_batch(uuid, jsonb) to authenticated;
