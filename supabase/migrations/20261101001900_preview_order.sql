create or replace function private.calculate_cart_totals(
  p_cart_id uuid,
  p_payment_method public.payment_method_type,
  p_fulfillment public.fulfillment_type,
  p_delivery_address text,
  p_coupon_code text,
  p_lock_rows boolean
)
returns table (
  shop_id uuid,
  customer_id uuid,
  subtotal integer,
  discount integer,
  total integer,
  coupon_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart public.carts;
  v_settings public.shop_settings;
  v_profile public.profiles;
  v_item record;
  v_product public.products;
  v_variant public.product_variants;
  v_coupon public.coupons;
  v_price integer;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_cart
  from public.carts
  where id = p_cart_id and carts.customer_id = v_uid;
  if not found then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;
  if not private.is_shop_public(v_cart.shop_id) then
    raise exception 'shop_not_available';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.phone is null then
    raise exception 'phone_required';
  end if;
  select * into v_settings from public.shop_settings where shop_id = v_cart.shop_id;

  if p_fulfillment = 'delivery' and not v_settings.delivery_enabled then
    raise exception 'delivery_disabled';
  end if;
  if p_fulfillment = 'pickup' and not v_settings.pickup_enabled then
    raise exception 'pickup_disabled';
  end if;
  if p_fulfillment = 'delivery' and coalesce(btrim(p_delivery_address), '') = '' then
    raise exception 'delivery_address_required';
  end if;
  if not exists (
    select 1 from public.shop_payment_methods m
    where m.shop_id = v_cart.shop_id and m.type = p_payment_method and m.active
  ) then
    raise exception 'payment_method_not_available';
  end if;
  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then
    raise exception 'cart_empty';
  end if;

  for v_item in
    select * from public.cart_items where cart_id = p_cart_id order by id
  loop
    v_variant := null;
    if p_lock_rows then
      select * into v_product
      from public.products
      where id = v_item.product_id and products.shop_id = v_cart.shop_id
      for update;
    else
      select * into v_product
      from public.products
      where id = v_item.product_id and products.shop_id = v_cart.shop_id;
    end if;
    if not found or v_product.deleted_at is not null or v_product.status <> 'available' then
      raise exception 'product_unavailable: %', v_item.product_id;
    end if;
    v_price := v_product.price;

    if v_item.variant_id is not null then
      if p_lock_rows then
        select * into v_variant
        from public.product_variants
        where id = v_item.variant_id
          and product_variants.shop_id = v_cart.shop_id
          and product_id = v_product.id
        for update;
      else
        select * into v_variant
        from public.product_variants
        where id = v_item.variant_id
          and product_variants.shop_id = v_cart.shop_id
          and product_id = v_product.id;
      end if;
      if not found then
        raise exception 'variant_unavailable: %', v_item.variant_id;
      end if;
      v_price := coalesce(v_variant.price, v_product.price);
      if v_variant.stock is not null and v_variant.stock < v_item.quantity then
        raise exception 'insufficient_stock: %', v_item.product_id;
      end if;
    elsif v_product.stock is not null and v_product.stock < v_item.quantity then
      raise exception 'insufficient_stock: %', v_item.product_id;
    end if;

    v_subtotal := v_subtotal + v_price * v_item.quantity;
  end loop;

  v_coupon := null;
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    if p_lock_rows then
      select * into v_coupon
      from public.coupons
      where coupons.shop_id = v_cart.shop_id
        and code = upper(btrim(p_coupon_code))
        and active
      for update;
    else
      select * into v_coupon
      from public.coupons
      where coupons.shop_id = v_cart.shop_id
        and code = upper(btrim(p_coupon_code))
        and active;
    end if;
    if not found
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.ends_at is not null and v_coupon.ends_at < now()) then
      raise exception 'coupon_invalid';
    end if;
    if v_subtotal < v_coupon.min_amount then
      raise exception 'coupon_min_amount';
    end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then
      raise exception 'coupon_exhausted';
    end if;
    select count(*) into v_count
    from public.coupon_redemptions
    where coupon_id = v_coupon.id and coupon_redemptions.customer_id = v_uid;
    if v_count >= v_coupon.per_customer_limit then
      raise exception 'coupon_already_used';
    end if;
    v_discount := least(
      v_subtotal,
      case v_coupon.type
        when 'percent' then (v_subtotal * v_coupon.value) / 100
        else v_coupon.value
      end
    );
  end if;

  if p_payment_method::text like 'ussd%'
     and v_settings.manual_payment_max_amount is not null
     and v_subtotal - v_discount > v_settings.manual_payment_max_amount then
    raise exception 'amount_exceeds_manual_limit';
  end if;

  return query
    select v_cart.shop_id, v_uid, v_subtotal, v_discount,
           v_subtotal - v_discount, v_coupon.id;
end;
$$;

revoke all on function private.calculate_cart_totals(
  uuid, public.payment_method_type, public.fulfillment_type, text, text, boolean
) from public, anon, authenticated, service_role;

create or replace function public.preview_order(
  p_cart_id uuid,
  p_payment_method public.payment_method_type,
  p_fulfillment public.fulfillment_type,
  p_coupon_code text
)
returns table (
  subtotal integer,
  discount integer,
  total integer,
  errors text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select c.subtotal, c.discount, c.total, array[]::text[]
    from private.calculate_cart_totals(
      p_cart_id, p_payment_method, p_fulfillment, null, p_coupon_code, false
    ) c;
exception
  when sqlstate 'P0001' or sqlstate 'P0002' then
    return query select null::integer, null::integer, null::integer, array[sqlerrm]::text[];
end;
$$;

create or replace function public.create_order_from_cart(
  p_cart_id uuid,
  p_payment_method public.payment_method_type,
  p_fulfillment public.fulfillment_type default 'pickup',
  p_delivery_address text default null,
  p_note text default null,
  p_coupon_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart public.carts;
  v_settings public.shop_settings;
  v_profile public.profiles;
  v_item record;
  v_product public.products;
  v_variant public.product_variants;
  v_calculation record;
  v_order_id uuid := gen_random_uuid();
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_cart
  from public.carts
  where id = p_cart_id and carts.customer_id = v_uid;
  if not found then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;

  select * into strict v_calculation
  from private.calculate_cart_totals(
    p_cart_id, p_payment_method, p_fulfillment, p_delivery_address, p_coupon_code, true
  );
  select * into v_profile from public.profiles where id = v_uid;
  select * into v_settings from public.shop_settings where shop_id = v_cart.shop_id;

  insert into public.orders (
    id, shop_id, customer_id, payment_method, fulfillment, delivery_address, note,
    customer_name, customer_phone, subtotal, discount, total, coupon_id
  )
  values (
    v_order_id, v_cart.shop_id, v_uid, p_payment_method, p_fulfillment,
    p_delivery_address, p_note, v_profile.full_name, v_profile.phone,
    v_calculation.subtotal, v_calculation.discount, v_calculation.total,
    v_calculation.coupon_id
  );

  for v_item in
    select * from public.cart_items where cart_id = p_cart_id order by id
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id and products.shop_id = v_cart.shop_id
    for update;
    v_variant := null;
    if v_item.variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_item.variant_id
        and product_variants.shop_id = v_cart.shop_id
        and product_id = v_product.id
      for update;
    end if;

    insert into public.order_items (
      shop_id, order_id, product_id, variant_id, name_snapshot, unit_price, quantity
    )
    values (
      v_cart.shop_id, v_order_id, v_product.id, v_item.variant_id,
      v_product.name || coalesce(' - ' || v_variant.name, ''),
      coalesce(v_variant.price, v_product.price), v_item.quantity
    );

    if v_item.variant_id is not null and v_variant.stock is not null then
      update public.product_variants
      set stock = stock - v_item.quantity
      where id = v_variant.id;
    elsif v_item.variant_id is null and v_product.stock is not null then
      update public.products
      set stock = stock - v_item.quantity
      where id = v_product.id;
    end if;
  end loop;

  if v_calculation.coupon_id is not null then
    insert into public.coupon_redemptions (shop_id, coupon_id, customer_id, order_id)
    values (v_cart.shop_id, v_calculation.coupon_id, v_uid, v_order_id);
    update public.coupons
    set used_count = used_count + 1
    where id = v_calculation.coupon_id;
  end if;

  v_expires := case
    when p_payment_method::text like 'ussd%'
      then now() + make_interval(hours => v_settings.order_expiry_manual_hours)
    when p_payment_method = 'aggregator'
      then now() + make_interval(mins => v_settings.order_expiry_online_minutes)
    else null
  end;

  update public.orders set expires_at = v_expires where id = v_order_id;

  insert into public.order_status_history (
    shop_id, order_id, from_status, to_status, actor_type, actor_id
  )
  values (v_cart.shop_id, v_order_id, null, 'pending_payment', 'customer', v_uid);

  delete from public.cart_items where cart_id = p_cart_id;
  return v_order_id;
end;
$$;

revoke execute on function public.preview_order(
  uuid, public.payment_method_type, public.fulfillment_type, text
) from public, anon;
grant execute on function public.preview_order(
  uuid, public.payment_method_type, public.fulfillment_type, text
) to authenticated;
