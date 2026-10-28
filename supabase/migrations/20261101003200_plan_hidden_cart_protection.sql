create or replace function private.prevent_hidden_plan_cart_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.products p
    where p.id = new.product_id
      and p.shop_id = new.shop_id
      and p.hidden_by_plan
  ) then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_hidden_plan_cart_item()
  from public, anon, authenticated, service_role;

create trigger cart_items_reject_plan_hidden
  before insert or update on public.cart_items
  for each row execute function private.prevent_hidden_plan_cart_item();
create trigger guest_cart_items_reject_plan_hidden
  before insert or update on public.guest_cart_items
  for each row execute function private.prevent_hidden_plan_cart_item();

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
        case
          when p.deleted_at is null and not p.is_sample
            and not p.hidden_by_plan
          then p.name
          else 'Article indisponible'
        end,
        v.name,
        ci.quantity,
        coalesce(v.price, p.price),
        p.status::text,
        p.deleted_at is null
          and not p.is_sample
          and not p.hidden_by_plan
          and p.status = 'available'
          and (ci.variant_id is null or v.id is not null)
          and case
            when ci.variant_id is null then p.stock is null or p.stock >= ci.quantity
            else v.stock is null or v.stock >= ci.quantity
          end,
        case when ci.variant_id is null then p.stock is not null else v.stock is not null end
      from public.guest_carts gc
      join public.guest_cart_items ci
        on ci.cart_id = gc.id and ci.shop_id = gc.shop_id
      join public.products p
        on p.id = ci.product_id and p.shop_id = ci.shop_id
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
      case
        when p.deleted_at is null and not p.is_sample
          and not p.hidden_by_plan
        then p.name
        else 'Article indisponible'
      end,
      v.name,
      ci.quantity,
      coalesce(v.price, p.price),
      p.status::text,
      p.deleted_at is null
        and not p.is_sample
        and not p.hidden_by_plan
        and p.status = 'available'
        and (ci.variant_id is null or v.id is not null)
        and case
          when ci.variant_id is null then p.stock is null or p.stock >= ci.quantity
          else v.stock is null or v.stock >= ci.quantity
        end,
      case when ci.variant_id is null then p.stock is not null else v.stock is not null end
    from public.carts c
    join public.cart_items ci
      on ci.cart_id = c.id and ci.shop_id = c.shop_id
    join public.products p
      on p.id = ci.product_id and p.shop_id = ci.shop_id
    left join public.product_variants v
      on v.id = ci.variant_id and v.shop_id = ci.shop_id and v.product_id = p.id
    where c.shop_id = p_shop and c.customer_id = v_user
    order by ci.id;
end;
$$;

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
    if not found
       or v_product.deleted_at is not null
       or v_product.hidden_by_plan
       or v_product.status <> 'available'
    then
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
       or (v_coupon.ends_at is not null and v_coupon.ends_at < now())
    then
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
    where coupon_id = v_coupon.id
      and coupon_redemptions.customer_id = v_uid;
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
     and v_subtotal - v_discount > v_settings.manual_payment_max_amount
  then
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
